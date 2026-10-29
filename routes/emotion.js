const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const emotionConn = require('../db/emotion');
const SessionReport = require('../models/SessionReport');
const {
  Segment, SegmentModality, VoiceFeature, OpenFaceFeature, PoseFeature, Transcript, FaceLandmark, EmotionPrediction,
} = require('../models/emotion');
const { verifyDroid } = require('../middleware/droidAuth');
const { verifyToken, adminOnly } = require('../middleware/auth');

// Optional per-segment feature blocks and the collection each one is written to
const FEATURE_MODELS = {
  modalities: SegmentModality,
  voice: VoiceFeature,
  openface: OpenFaceFeature,
  pose: PoseFeature,
  transcript: Transcript,
  landmarks: FaceLandmark,
  prediction: EmotionPrediction,
};

const FREE_TIER_BYTES = 512 * 1024 * 1024;

function requireEmotionDb(req, res, next) {
  if (!emotionConn.isReady()) {
    return res.status(503).json({ message: 'Research database unavailable' });
  }
  next();
}

// POST /api/emotion/segments — written by droid/feature pipeline
// Body: { segment: {...}, modalities?, voice?, openface?, pose?, transcript?, landmarks?, prediction? }
// EngageBot droids never send transcript (the mic only measures noise level).
// All documents for one segment are written in a single transaction: all or nothing.
router.post('/segments', verifyDroid, async (req, res) => {
  if (!emotionConn.isReady()) {
    return res.status(503).json({ message: 'Research database unavailable' });
  }

  const { segment, ...features } = req.body || {};
  if (!segment || typeof segment !== 'object') {
    return res.status(400).json({ message: 'segment object required' });
  }

  const unknown = Object.keys(features).filter(k => !FEATURE_MODELS[k]);
  if (unknown.length) {
    return res.status(400).json({ message: `Unknown feature blocks: ${unknown.join(', ')}` });
  }

  for (const [key, block] of Object.entries(features)) {
    if (block?.segment_id && block.segment_id !== segment.segment_id) {
      return res.status(400).json({ message: `${key}.segment_id does not match segment.segment_id` });
    }
  }

  // Reject unknown fields here: Zhang's format has a field named `schema`, which makes Mongoose's
  // strict:'throw' crash with a TypeError instead of a clean StrictModeError.
  for (const [key, block] of [['segment', segment], ...Object.entries(features)]) {
    if (!block) continue;
    const Model = key === 'segment' ? Segment : FEATURE_MODELS[key];
    const extra = Object.keys(block).filter(f => Model.schema.pathType(f) === 'adhocOrUndefined');
    if (extra.length) {
      return res.status(400).json({ message: `${key}: unknown fields ${extra.join(', ')}` });
    }
  }

  try {
    // If the droid sends an EngageBot SessionReport id as session_id, take the start time from it
    if (!segment.session_start_time && mongoose.isValidObjectId(segment.session_id)) {
      const report = await SessionReport.findById(segment.session_id, 'startedAt').lean();
      if (report?.startedAt) segment.session_start_time = report.startedAt;
    }

    const written = ['segment'];
    const dbSession = await emotionConn.startSession();
    try {
      await dbSession.withTransaction(async () => {
        await Segment.create([segment], { session: dbSession });
        for (const [key, block] of Object.entries(features)) {
          if (!block) continue;
          await FEATURE_MODELS[key].create([{ ...block, segment_id: segment.segment_id }], { session: dbSession });
          written.push(key);
        }
      });
    } finally {
      await dbSession.endSession();
    }

    res.status(201).json({ segment_id: segment.segment_id, written });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: `Segment ${segment.segment_id} already exists` });
    }
    if (['ValidationError', 'StrictModeError', 'CastError'].includes(err.name)) {
      return res.status(400).json({ message: err.message });
    }
    res.status(500).json({ message: err.message });
  }
});

// GET /api/emotion/sessions/:sessionId
// Every segment of a class session with its emotion prediction and noise level, in time order.
router.get('/sessions/:sessionId', verifyToken, requireEmotionDb, async (req, res) => {
  try {
    const segments = await Segment.find({ session_id: req.params.sessionId })
      .sort({ start_offset_sec: 1 }).lean();
    const ids = segments.map(s => s.segment_id);

    const [predictions, noise] = await Promise.all([
      EmotionPrediction.find({ segment_id: { $in: ids } }).lean(),
      VoiceFeature.find({ segment_id: { $in: ids } }, 'segment_id energy_mean energy_std pause_ratio').lean(),
    ]);
    const predictionBySegment = new Map(predictions.map(p => [p.segment_id, { ...p, _id: undefined }]));
    const noiseBySegment = new Map(noise.map(n => [n.segment_id, { ...n, _id: undefined, segment_id: undefined }]));

    res.json({
      session_id: req.params.sessionId,
      segments: segments.map(s => ({
        ...s,
        _id: undefined,
        prediction: predictionBySegment.get(s.segment_id) || null,
        noise: noiseBySegment.get(s.segment_id) || null,
      })),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/emotion/predictions/:segmentId/label
// Teacher corrects (or clears, with null) the predicted emotion for one student segment.
router.patch('/predictions/:segmentId/label', verifyToken, requireEmotionDb, async (req, res) => {
  try {
    const { label } = req.body || {};
    if (label !== null && (typeof label !== 'string' || !label.trim())) {
      return res.status(400).json({ message: 'label must be a non-empty string or null' });
    }
    const prediction = await EmotionPrediction.findOneAndUpdate(
      { segment_id: req.params.segmentId },
      { teacher_label: label === null ? null : label.trim() },
      { new: true },
    ).lean();
    if (!prediction) return res.status(404).json({ message: 'Prediction not found' });
    res.json({ ...prediction, _id: undefined });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/emotion/storage
// Size of the EngageBot research database against the Atlas free tier (512 MB).
// The limit is shared with everything else on Zhang's cluster, so treat this as a lower bound.
router.get('/storage', verifyToken, adminOnly, requireEmotionDb, async (req, res) => {
  try {
    const stats = await emotionConn.db.stats();
    const usedBytes = stats.dataSize + stats.indexSize;
    res.json({
      database: emotionConn.name,
      dataSizeBytes: stats.dataSize,
      indexSizeBytes: stats.indexSize,
      usedBytes,
      freeTierLimitBytes: FREE_TIER_BYTES,
      percentOfFreeTier: Math.round((usedBytes / FREE_TIER_BYTES) * 1000) / 10,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;

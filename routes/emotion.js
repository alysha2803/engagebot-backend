const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const emotionConn = require('../db/emotion');
const SessionReport = require('../models/SessionReport');
const { Segment, SegmentModality, VoiceFeature, OpenFaceFeature, PoseFeature, Transcript } = require('../models/emotion');
const { verifyDroid } = require('../middleware/droidAuth');

// Optional per-segment feature blocks and the collection each one is written to
const FEATURE_MODELS = {
  modalities: SegmentModality,
  voice: VoiceFeature,
  openface: OpenFaceFeature,
  pose: PoseFeature,
  transcript: Transcript,
};

// POST /api/emotion/segments — written by droid/feature pipeline
// Body: { segment: {...}, modalities?, voice?, openface?, pose?, transcript? }
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

module.exports = router;

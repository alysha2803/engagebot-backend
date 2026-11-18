const express = require('express');
const router = express.Router();
const PendingFace = require('../models/PendingFace');
const Student = require('../models/Student');
const { verifyToken } = require('../middleware/auth');
const { appendEmbeddings } = require('../utils/embeddingStore');

// Embeddings are already L2-normalized (see face_embedding.py), so cosine
// similarity is just the dot product -- same convention as the droid side.
function cosineSimilarity(a, b) {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

// Best (max) similarity between any embedding of face A and any embedding
// of face B -- same "best match" philosophy as face_recognizer.py.
function bestSimilarity(embeddingsA, embeddingsB) {
  let best = -1;
  for (const a of embeddingsA) {
    for (const b of embeddingsB) {
      const sim = cosineSimilarity(a, b);
      if (sim > best) best = sim;
    }
  }
  return best;
}

// Rough starting threshold for SUGGESTING a possible duplicate to a human
// for review -- deliberately looser than face_recognizer.py's live-matching
// MIN_SCORE (0.60), since a false suggestion just costs the teacher one tap
// of "No", while a missed one leaves a student split across two identities.
const MERGE_SUGGEST_MIN_SCORE = 0.55;

// GET /api/pending-faces/class/:classGroup — labeling list for the app (no embeddings)
router.get('/class/:classGroup', verifyToken, async (req, res) => {
  try {
    const faces = await PendingFace.find({ classGroup: req.params.classGroup }).sort({ lastSeenAt: -1 });
    res.json(faces.map(f => f.toPublic()));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/pending-faces/class/:classGroup/embeddings — droid-only, for matching
router.get('/class/:classGroup/embeddings', verifyToken, async (req, res) => {
  try {
    const faces = await PendingFace.find({ classGroup: req.params.classGroup }, { embeddings: 1 }).lean();
    res.json(faces.map(f => ({ id: f._id.toString(), name: `Unlabeled-${f._id.toString().slice(-4)}`, embeddings: f.embeddings })));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/pending-faces/class/:classGroup/merge-suggestions — "Is this the
// same person?" candidates (Apple-Photos-People-style), sorted most-likely
// first. Skips any pair the teacher already said "No" to.
router.get('/class/:classGroup/merge-suggestions', verifyToken, async (req, res) => {
  try {
    const faces = await PendingFace.find({ classGroup: req.params.classGroup });
    const suggestions = [];

    for (let i = 0; i < faces.length; i++) {
      for (let j = i + 1; j < faces.length; j++) {
        const a = faces[i];
        const b = faces[j];
        if (a.dismissedMerges.includes(b._id.toString())) continue;
        const score = bestSimilarity(a.embeddings, b.embeddings);
        if (score >= MERGE_SUGGEST_MIN_SCORE) {
          suggestions.push({
            faceA: a.toPublic(),
            faceB: b.toPublic(),
            score: Math.round(score * 100) / 100,
          });
        }
      }
    }

    suggestions.sort((x, y) => y.score - x.score);
    res.json(suggestions);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/pending-faces/:id/dismiss-merge/:otherId — teacher confirmed
// these are NOT the same person; never suggest this pair again.
router.post('/:id/dismiss-merge/:otherId', verifyToken, async (req, res) => {
  try {
    const { id, otherId } = req.params;
    await Promise.all([
      PendingFace.findByIdAndUpdate(id, { $addToSet: { dismissedMerges: otherId } }),
      PendingFace.findByIdAndUpdate(otherId, { $addToSet: { dismissedMerges: id } }),
    ]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/pending-faces — droid creates a new one on first unrecognized sighting
router.post('/', verifyToken, async (req, res) => {
  try {
    const { classGroup, embedding, thumbnail } = req.body;
    if (!classGroup || !Array.isArray(embedding)) {
      return res.status(400).json({ message: 'classGroup and embedding (array of numbers) are required' });
    }
    const face = await PendingFace.create({ classGroup, embeddings: [embedding], thumbnail });
    res.status(201).json({ id: face._id.toString(), name: `Unlabeled-${face._id.toString().slice(-4)}` });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/pending-faces/:id/grow — droid adds another high-confidence sighting
router.patch('/:id/grow', verifyToken, async (req, res) => {
  try {
    const { embedding } = req.body;
    if (!Array.isArray(embedding)) {
      return res.status(400).json({ message: 'embedding (array of numbers) is required' });
    }
    const face = await PendingFace.findById(req.params.id);
    if (!face) return res.status(404).json({ message: 'Pending face not found' });
    face.embeddings = appendEmbeddings(face.embeddings, [embedding]);
    face.sightCount += 1;
    face.lastSeenAt = new Date();
    await face.save();
    res.json({ id: face._id.toString(), sightCount: face.sightCount });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/pending-faces/:id/label — teacher assigns a real student to this face
router.post('/:id/label', verifyToken, async (req, res) => {
  try {
    const { studentId } = req.body;
    if (!studentId) return res.status(400).json({ message: 'studentId is required' });

    const face = await PendingFace.findById(req.params.id);
    if (!face) return res.status(404).json({ message: 'Pending face not found' });

    const student = await Student.findById(studentId).select('faceEmbeddings');
    if (!student) return res.status(404).json({ message: 'Student not found' });

    student.faceEmbeddings = appendEmbeddings(student.faceEmbeddings, face.embeddings);
    student.faceEnrolledAt = new Date();
    await student.save();

    await face.deleteOne();
    res.json({ studentId: student._id.toString(), enrolledVectors: student.faceEmbeddings.length });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/pending-faces/:id/merge/:otherId — same person was split into two
// anonymous identities (common failure mode at class-size scale) -- combine
// them into one. Keeps :id, deletes :otherId.
router.post('/:id/merge/:otherId', verifyToken, async (req, res) => {
  try {
    const [face, other] = await Promise.all([
      PendingFace.findById(req.params.id),
      PendingFace.findById(req.params.otherId),
    ]);
    if (!face || !other) return res.status(404).json({ message: 'Pending face not found' });

    face.embeddings = appendEmbeddings(face.embeddings, other.embeddings);
    face.sightCount += other.sightCount;
    face.lastSeenAt = new Date(Math.max(face.lastSeenAt, other.lastSeenAt));
    await face.save();
    await other.deleteOne();

    res.json(face.toPublic());
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/pending-faces/:id — dismiss without labeling (false positive, etc.)
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const face = await PendingFace.findByIdAndDelete(req.params.id);
    if (!face) return res.status(404).json({ message: 'Pending face not found' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;

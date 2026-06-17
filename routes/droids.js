const express = require('express');
const router = express.Router();
const Droid = require('../models/Droid');
const { verifyToken, adminOnly } = require('../middleware/auth');

async function nextDroidId() {
  const count = await Droid.countDocuments();
  return `DRD-${String(count + 1).padStart(3, '0')}`;
}

// GET /api/droids
router.get('/', verifyToken, async (req, res) => {
  try {
    const droids = await Droid.find().lean();
    res.json(droids.map(d => ({ ...d, id: d._id.toString(), _id: undefined, __v: undefined })));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/droids
router.post('/', verifyToken, adminOnly, async (req, res) => {
  try {
    const { serialNumber, assignedRoom, firmware } = req.body;
    if (!serialNumber) return res.status(400).json({ message: 'serialNumber is required' });
    const droidId = await nextDroidId();
    const droid = await Droid.create({ droidId, serialNumber, assignedRoom, firmware, battery: 0, lastPing: 'Waiting for first ping…', status: 'inactive' });
    res.status(201).json(droid.toPublic());
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/droids/:id
router.patch('/:id', verifyToken, adminOnly, async (req, res) => {
  try {
    const allowed = ['assignedRoom', 'firmware', 'battery', 'lastPing', 'status', 'telemetryNotes'];
    const patch = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) patch[key] = req.body[key];
    }
    const droid = await Droid.findByIdAndUpdate(req.params.id, patch, { new: true });
    if (!droid) return res.status(404).json({ message: 'Droid not found' });
    res.json(droid.toPublic());
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;

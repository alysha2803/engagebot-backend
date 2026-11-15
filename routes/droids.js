const express = require('express');
const router = express.Router();
const Droid = require('../models/Droid');
const ClassGroup = require('../models/ClassGroup');
const { verifyToken, adminOnly } = require('../middleware/auth');
const { verifyDroid } = require('../middleware/droidAuth');
const sendError = require('../utils/sendError');
const nextSequence = require('../utils/sequence');

const OFFLINE_AFTER_MS = 5 * 60 * 1000;

const pingLabel = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Kuala_Lumpur', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

async function nextDroidId() {
  const seq = await nextSequence('droidId', async () => {
    const last = await Droid.findOne({}, { droidId: 1 }).sort({ droidId: -1 }).lean();
    return last ? parseInt(last.droidId.replace('DRD-', ''), 10) || 0 : 0;
  });
  return `DRD-${String(seq).padStart(3, '0')}`;
}

// GET /api/droids — a droid that has stopped sending heartbeats is reported as offline
router.get('/', verifyToken, async (req, res) => {
  try {
    const droids = await Droid.find().lean();
    const cutoff = Date.now() - OFFLINE_AFTER_MS;
    res.json(droids.map(d => ({
      ...d,
      id: d._id.toString(),
      status: d.status === 'active' && d.lastPingAt && d.lastPingAt.getTime() < cutoff ? 'offline' : d.status,
      _id: undefined,
      __v: undefined,
    })));
  } catch (err) {
    sendError(res, err);
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
    sendError(res, err);
  }
});

// POST /api/droids/:droidId/heartbeat — the droid reports in using its own ID, e.g. DRD-001
router.post('/:droidId/heartbeat', verifyDroid, async (req, res) => {
  try {
    const patch = { status: 'active' };
    for (const key of ['battery', 'firmware', 'status', 'telemetryNotes']) {
      if (req.body[key] !== undefined) patch[key] = req.body[key];
    }
    const now = new Date();
    const droid = await Droid.findOneAndUpdate(
      { droidId: req.params.droidId },
      { ...patch, lastPing: pingLabel.format(now), lastPingAt: now },
      { new: true },
    );
    if (!droid) return res.status(404).json({ message: 'Droid not found' });
    res.json(droid.toPublic());
  } catch (err) {
    sendError(res, err);
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
    sendError(res, err);
  }
});

// DELETE /api/droids/:id — decommission a droid and unassign it from its class
router.delete('/:id', verifyToken, adminOnly, async (req, res) => {
  try {
    const droid = await Droid.findByIdAndDelete(req.params.id);
    if (!droid) return res.status(404).json({ message: 'Droid not found' });
    await ClassGroup.updateMany(
      { droidId: { $in: [droid.droidId, droid._id.toString()] } },
      { $unset: { droidId: 1 } },
    );
    res.json({ message: 'Droid deleted' });
  } catch (err) {
    sendError(res, err);
  }
});

module.exports = router;

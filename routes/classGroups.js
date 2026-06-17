const express = require('express');
const router = express.Router();
const ClassGroup = require('../models/ClassGroup');
const { verifyToken, adminOnly } = require('../middleware/auth');

// GET /api/class-groups
router.get('/', verifyToken, async (req, res) => {
  try {
    const groups = await ClassGroup.find().lean();
    res.json(groups.map(g => ({ ...g, id: g._id.toString(), _id: undefined, __v: undefined })));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/class-groups
router.post('/', verifyToken, adminOnly, async (req, res) => {
  try {
    const { name, academicYear, room, droidId } = req.body;
    if (!name || !academicYear) return res.status(400).json({ message: 'name and academicYear are required' });
    const group = await ClassGroup.create({ name, academicYear, room, droidId });
    res.status(201).json(group.toPublic());
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/class-groups/:id
router.patch('/:id', verifyToken, adminOnly, async (req, res) => {
  try {
    const allowed = ['name', 'academicYear', 'room', 'droidId', 'recessTime'];
    const patch = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) patch[key] = req.body[key];
    }
    const group = await ClassGroup.findByIdAndUpdate(req.params.id, patch, { new: true });
    if (!group) return res.status(404).json({ message: 'Class group not found' });
    res.json(group.toPublic());
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;

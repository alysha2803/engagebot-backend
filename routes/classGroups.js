const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const ClassGroup = require('../models/ClassGroup');
const ClassSchedule = require('../models/ClassSchedule');
const Student = require('../models/Student');
const Droid = require('../models/Droid');
const SessionReport = require('../models/SessionReport');
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

    const existing = await ClassGroup.findById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Class group not found' });
    const oldName = existing.name;
    const renamed = patch.name !== undefined && patch.name !== oldName;

    if (!renamed) {
      const group = await ClassGroup.findByIdAndUpdate(req.params.id, patch, { new: true });
      return res.json(group.toPublic());
    }

    // Name changed → cascade the rename across every record that links by name.
    const newName = patch.name;
    let group;
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        group = await ClassGroup.findByIdAndUpdate(req.params.id, patch, { new: true, session });
        await ClassSchedule.updateMany({ classGroup: oldName }, { classGroup: newName }, { session });
        await Student.updateMany({ classGroup: oldName }, { classGroup: newName }, { session });
        await Droid.updateMany({ assignedRoom: oldName }, { assignedRoom: newName }, { session });
        await SessionReport.updateMany({ classGroup: oldName }, { classGroup: newName }, { session });
      });
    } finally {
      await session.endSession();
    }
    res.json(group.toPublic());
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// DELETE /api/class-groups/:id
router.delete('/:id', verifyToken, adminOnly, async (req, res) => {
  try {
    const group = await ClassGroup.findById(req.params.id);
    if (!group) return res.status(404).json({ message: 'Class group not found' });
    const name = group.name;

    // Cascade: delete this class's sessions, unassign its students and droids,
    // then remove the group. Historical session reports are intentionally kept.
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await ClassSchedule.deleteMany({ classGroup: name }, { session });
        await Student.updateMany({ classGroup: name }, { classGroup: 'Unassigned' }, { session });
        await Droid.updateMany({ assignedRoom: name }, { assignedRoom: 'Unassigned' }, { session });
        await ClassGroup.deleteOne({ _id: group._id }, { session });
      });
    } finally {
      await session.endSession();
    }
    res.json({ message: 'Class group deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;

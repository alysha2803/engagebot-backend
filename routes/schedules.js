const express = require('express');
const router = express.Router();
const ClassSchedule = require('../models/ClassSchedule');
const Teacher = require('../models/Teacher');
const { verifyToken, adminOnly } = require('../middleware/auth');

const SESSION_COLORS = {
  Mathematics: '#DBEAFE',
  'Bahasa Melayu': '#FEF9C3',
  'English Language': '#EDE9FE',
  Chemistry: '#DCFCE7',
  Physics: '#FEE2E2',
  Science: '#CFFAFE',
  Biology: '#D1FAE5',
  History: '#F3F4F6',
  'Add Maths': '#FEF3C7',
  'P. Islam': '#ECFDF5',
};

// GET /api/schedules
router.get('/', verifyToken, async (req, res) => {
  try {
    const filter = {};
    if (req.query.teacherId) filter.teacherId = req.query.teacherId;
    if (req.query.classGroup) filter.classGroup = req.query.classGroup;
    const sessions = await ClassSchedule.find(filter).lean();
    res.json(sessions.map(s => ({ ...s, id: s._id.toString(), _id: undefined, __v: undefined })));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/schedules
router.post('/', verifyToken, adminOnly, async (req, res) => {
  try {
    const { subject, teacherId, teacherName, classGroup, startTime, endTime, day } = req.body;
    if (!subject || !teacherId || !teacherName || !classGroup || !startTime || !endTime || !day) {
      return res.status(400).json({ message: 'Missing required session fields' });
    }
    const session = await ClassSchedule.create({
      subject, teacherId, teacherName, classGroup, startTime, endTime, day,
      status: 'scheduled',
      color: SESSION_COLORS[subject] ?? '#F3F4F6',
    });
    // Auto-assign this class to the teacher
    await Teacher.findByIdAndUpdate(teacherId, { $addToSet: { assignedClasses: classGroup } });
    res.status(201).json(session.toPublic());
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/schedules/:id
router.patch('/:id', verifyToken, adminOnly, async (req, res) => {
  try {
    const allowed = ['subject', 'teacherId', 'teacherName', 'classGroup', 'startTime', 'endTime', 'day', 'status', 'color', 'checkedIn', 'checkInTime'];
    const patch = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) patch[key] = req.body[key];
    }

    const oldSession = await ClassSchedule.findById(req.params.id);
    if (!oldSession) return res.status(404).json({ message: 'Session not found' });

    const session = await ClassSchedule.findByIdAndUpdate(req.params.id, patch, { new: true });

    const newTeacherId = patch.teacherId?.toString();
    const oldTeacherId = oldSession.teacherId?.toString();
    const classGroup = session.classGroup;

    if (newTeacherId && newTeacherId !== oldTeacherId) {
      // Remove old teacher from class if they have no other sessions there
      if (oldTeacherId) {
        const remaining = await ClassSchedule.countDocuments({
          teacherId: oldTeacherId, classGroup, _id: { $ne: req.params.id },
        });
        if (remaining === 0) {
          await Teacher.findByIdAndUpdate(oldTeacherId, { $pull: { assignedClasses: classGroup } });
        }
      }
      // Add new teacher to class
      await Teacher.findByIdAndUpdate(newTeacherId, { $addToSet: { assignedClasses: classGroup } });
    }

    res.json(session.toPublic());
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/:id', verifyToken, adminOnly, async (req, res) => {
  try {
    const session = await ClassSchedule.findById(req.params.id);
    if (!session) return res.status(404).json({ message: 'Session not found' });

    await ClassSchedule.findByIdAndDelete(req.params.id);

    // Remove class from teacher if they have no remaining sessions there
    if (session.teacherId) {
      const remaining = await ClassSchedule.countDocuments({
        teacherId: session.teacherId,
        classGroup: session.classGroup,
        _id: { $ne: req.params.id },
      });
      if (remaining === 0) {
        await Teacher.findByIdAndUpdate(session.teacherId, { $pull: { assignedClasses: session.classGroup } });
      }
    }

    res.json({ message: 'Schedule deleted' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;

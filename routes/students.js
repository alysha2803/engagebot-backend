const express = require('express');
const router = express.Router();
const Student = require('../models/Student');
const { verifyToken, adminOnly } = require('../middleware/auth');

async function nextStudentId() {
  const count = await Student.countDocuments();
  return `STU-${String(count + 1).padStart(5, '0')}`;
}

// GET /api/students — list all (admin), or by teacherId query param (teacher)
router.get('/', verifyToken, async (req, res) => {
  try {
    const filter = {};
    if (req.query.classGroup) filter.classGroup = req.query.classGroup;
    const students = await Student.find(filter).lean();
    res.json(students.map(s => ({ ...s, id: s._id.toString(), _id: undefined, __v: undefined })));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/students — admin creates a student
router.post('/', verifyToken, adminOnly, async (req, res) => {
  try {
    const { name, icNumber, classGroup, batchId } = req.body;
    if (!name || !icNumber || !classGroup) {
      return res.status(400).json({ message: 'name, icNumber and classGroup are required' });
    }

    const studentId = await nextStudentId();
    const student = await Student.create({ name, icNumber, classGroup, batchId, studentId, source: 'manual', status: 'pending' });
    res.status(201).json(student.toPublic());
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/students/:id — update a student (admin or teacher)
router.patch('/:id', verifyToken, async (req, res) => {
  try {
    const allowed = ['name', 'icNumber', 'classGroup', 'status'];
    const patch = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) patch[key] = req.body[key];
    }

    const student = await Student.findByIdAndUpdate(req.params.id, patch, { new: true });
    if (!student) return res.status(404).json({ message: 'Student not found' });
    res.json(student.toPublic());
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;

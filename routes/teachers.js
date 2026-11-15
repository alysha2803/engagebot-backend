const express = require('express');
const router = express.Router();
const Teacher = require('../models/Teacher');
const ClassSchedule = require('../models/ClassSchedule');
const { verifyToken, adminOnly } = require('../middleware/auth');
const sendError = require('../utils/sendError');

const MIN_PASSWORD_LENGTH = 8;

// Schedules store a copy of the teacher's name. Past session reports keep the name at the time.
const syncScheduleNames = (teacherId, name) => ClassSchedule.updateMany({ teacherId }, { teacherName: name });

async function nextEmployeeId() {
  const year = new Date().getFullYear();
  const prefix = `EB-${year}-`;
  const last = await Teacher.findOne(
    { employeeId: { $regex: `^${prefix}` } },
    { employeeId: 1 },
    { sort: { employeeId: -1 } }
  );
  const nextNum = last ? parseInt(last.employeeId.replace(prefix, ''), 10) + 1 : 1;
  return `${prefix}${String(nextNum).padStart(3, '0')}`;
}

// GET /api/teachers — list all teachers (admin only)
router.get('/', verifyToken, adminOnly, async (req, res) => {
  try {
    const teachers = await Teacher.find().select('-password').lean();
    res.json(teachers.map(t => ({ ...t, id: t._id.toString(), _id: undefined, __v: undefined })));
  } catch (err) {
    sendError(res, err);
  }
});

// GET /api/teachers/profile — teacher's own profile (teacher JWT)
router.get('/profile', verifyToken, async (req, res) => {
  try {
    const teacher = await Teacher.findById(req.user.id);
    if (!teacher) return res.status(404).json({ message: 'Teacher not found' });
    res.json(teacher.toPublic());
  } catch (err) {
    sendError(res, err);
  }
});

// PATCH /api/teachers/profile — teacher updates their own name
router.patch('/profile', verifyToken, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'name is required' });
    }
    const teacher = await Teacher.findByIdAndUpdate(
      req.user.id,
      { name: name.trim() },
      { new: true }
    );
    if (!teacher) return res.status(404).json({ message: 'Teacher not found' });
    await syncScheduleNames(req.user.id, teacher.name);
    res.json(teacher.toPublic());
  } catch (err) {
    sendError(res, err);
  }
});

// POST /api/teachers — admin creates a new teacher with a temporary password
router.post('/', verifyToken, adminOnly, async (req, res) => {
  try {
    const { name, email, password, department, subjects, assignedClasses } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'name, email and password are required' });
    }

    const existing = await Teacher.findOne({ email: email.trim().toLowerCase() });
    if (existing) return res.status(400).json({ message: 'A teacher with this email already exists' });

    const employeeId = await nextEmployeeId();
    const teacher = await Teacher.create({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password,
      department: department || '',
      subjects: subjects || [],
      assignedClasses: assignedClasses || [],
      employeeId,
      status: 'pending',
    });
    res.status(201).json(teacher.toPublic());
  } catch (err) {
    sendError(res, err);
  }
});

// PATCH /api/teachers/:id — admin updates a teacher
router.patch('/:id', verifyToken, adminOnly, async (req, res) => {
  try {
    const allowed = ['name', 'email', 'department', 'subjects', 'assignedClasses', 'status', 'school'];
    const patch = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) patch[key] = req.body[key];
    }
    if (patch.email) patch.email = patch.email.trim().toLowerCase();

    const teacher = await Teacher.findByIdAndUpdate(req.params.id, patch, { new: true });
    if (!teacher) return res.status(404).json({ message: 'Teacher not found' });
    if (patch.name) await syncScheduleNames(req.params.id, teacher.name);
    res.json(teacher.toPublic());
  } catch (err) {
    sendError(res, err);
  }
});

// POST /api/teachers/:id/reset-password — admin sets a new temporary password
router.post('/:id/reset-password', verifyToken, adminOnly, async (req, res) => {
  try {
    const { password } = req.body;
    if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ message: `password must be at least ${MIN_PASSWORD_LENGTH} characters` });
    }
    const teacher = await Teacher.findById(req.params.id);
    if (!teacher) return res.status(404).json({ message: 'Teacher not found' });
    teacher.password = password;
    await teacher.save(); // the model's hook hashes it
    res.json({ message: 'Password reset' });
  } catch (err) {
    sendError(res, err);
  }
});

// DELETE /api/teachers/:id — permanently delete teacher and their schedule slots
router.delete('/:id', verifyToken, adminOnly, async (req, res) => {
  try {
    const teacher = await Teacher.findByIdAndDelete(req.params.id);
    if (!teacher) return res.status(404).json({ message: 'Teacher not found' });
    await ClassSchedule.deleteMany({ teacherId: req.params.id });
    res.json({ message: 'Teacher deleted' });
  } catch (err) {
    sendError(res, err);
  }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');
const Teacher = require('../models/Teacher');
const { verifyToken } = require('../middleware/auth');

function signToken(payload, expiresIn = '8h') {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn });
}

// POST /api/auth/admin/login
// Admin web app calls this to log in with email + password.
router.post('/admin/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Email and password required' });

    const admin = await Admin.findOne({ email: email.trim().toLowerCase() });
    if (!admin || !(await admin.comparePassword(password))) {
      return res.status(401).json({ message: 'Incorrect email or password' });
    }

    const token = signToken({ id: admin._id, role: admin.role, email: admin.email });
    res.json({
      token,
      user: { uid: admin._id, email: admin.email, displayName: admin.displayName, photoURL: null, role: admin.role },
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/auth/teacher/login
// Mobile app calls this to log in with email + password.
router.post('/teacher/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Email and password required' });

    const teacher = await Teacher.findOne({ email: email.trim().toLowerCase(), isActive: true });
    if (!teacher || !(await teacher.comparePassword(password))) {
      return res.status(401).json({ message: 'Incorrect email or password' });
    }
    if (teacher.status === 'inactive') {
      return res.status(403).json({ message: 'This account has been deactivated. Contact your admin.' });
    }

    const token = signToken({ id: teacher._id, role: 'teacher', email: teacher.email }, '30d');
    res.json({ token, teacher: teacher.toPublic() });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/auth/me
// Returns the currently authenticated user (admin or teacher).
router.get('/me', verifyToken, async (req, res) => {
  try {
    if (req.user.role === 'teacher') {
      const teacher = await Teacher.findById(req.user.id);
      if (!teacher) return res.status(404).json({ message: 'Teacher not found' });
      return res.json(teacher.toPublic());
    }
    const admin = await Admin.findById(req.user.id).select('-password');
    if (!admin) return res.status(404).json({ message: 'Admin not found' });
    res.json({ uid: admin._id, email: admin.email, displayName: admin.displayName, photoURL: null, role: admin.role });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;

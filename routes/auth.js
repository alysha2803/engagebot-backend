const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { rateLimit } = require('express-rate-limit');
const Admin = require('../models/Admin');
const Teacher = require('../models/Teacher');
const { verifyToken } = require('../middleware/auth');
const sendError = require('../utils/sendError');

const MIN_PASSWORD_LENGTH = 8;

// Only failed attempts count, so normal logins from a shared school network aren't blocked.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many failed login attempts. Try again in 15 minutes.' },
});

function signToken(payload, expiresIn = '8h') {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn });
}

// POST /api/auth/admin/login
// Admin web app calls this to log in with email + password.
router.post('/admin/login', loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
      return res.status(400).json({ message: 'Email and password required' });
    }

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
    sendError(res, err);
  }
});

// POST /api/auth/teacher/login
// Mobile app calls this to log in with email + password.
router.post('/teacher/login', loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
      return res.status(400).json({ message: 'Email and password required' });
    }

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
    sendError(res, err);
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
    sendError(res, err);
  }
});

// POST /api/auth/change-password
// Any logged-in admin or teacher changes their own password.
router.post('/change-password', loginLimiter, verifyToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
      return res.status(400).json({ message: 'currentPassword and newPassword are required' });
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ message: `New password must be at least ${MIN_PASSWORD_LENGTH} characters` });
    }
    const Model = req.user.role === 'teacher' ? Teacher : Admin;
    const account = await Model.findById(req.user.id);
    if (!account || !(await account.comparePassword(currentPassword))) {
      return res.status(401).json({ message: 'Current password is incorrect' });
    }
    account.password = newPassword;
    await account.save(); // the model's hook hashes it
    res.json({ message: 'Password changed' });
  } catch (err) {
    sendError(res, err);
  }
});

module.exports = router;

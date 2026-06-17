const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');
const { verifyToken } = require('../middleware/auth');

// GET /api/notifications
router.get('/', verifyToken, async (req, res) => {
  try {
    const filter = {};
    // Teachers only see their own notifications
    if (req.user.role === 'teacher') filter.teacherId = req.user.id;
    if (req.query.teacherId) filter.teacherId = req.query.teacherId;
    const notifications = await Notification.find(filter).lean();
    res.json(notifications.map(n => ({ ...n, id: n._id.toString(), _id: undefined, __v: undefined })));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/notifications
router.post('/', verifyToken, async (req, res) => {
  try {
    const { teacherId, type, message, sessionId } = req.body;
    if (!teacherId || !type || !message) {
      return res.status(400).json({ message: 'teacherId, type and message are required' });
    }
    const notification = await Notification.create({
      teacherId, type, message, sessionId,
      read: false,
      createdAt: new Date().toISOString(),
    });
    res.status(201).json(notification.toPublic());
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PATCH /api/notifications/:id/read — mark as read (teacher)
router.patch('/:id/read', verifyToken, async (req, res) => {
  try {
    const notification = await Notification.findByIdAndUpdate(req.params.id, { read: true }, { new: true });
    if (!notification) return res.status(404).json({ message: 'Notification not found' });
    res.json(notification.toPublic());
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;

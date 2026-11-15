const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');
const { verifyToken, isTeacher } = require('../middleware/auth');
const sendError = require('../utils/sendError');

// GET /api/notifications
router.get('/', verifyToken, async (req, res) => {
  try {
    const filter = {};
    if (req.query.teacherId) filter.teacherId = req.query.teacherId;
    // Teachers only see their own notifications, whatever they ask for
    if (isTeacher(req)) filter.teacherId = req.user.id;
    const notifications = await Notification.find(filter).lean();
    res.json(notifications.map(n => ({ ...n, id: n._id.toString(), _id: undefined, __v: undefined })));
  } catch (err) {
    sendError(res, err);
  }
});

// POST /api/notifications — admins notify any teacher; teachers only themselves
router.post('/', verifyToken, async (req, res) => {
  try {
    const { teacherId, type, message, sessionId } = req.body;
    if (!teacherId || !type || !message) {
      return res.status(400).json({ message: 'teacherId, type and message are required' });
    }
    if (isTeacher(req) && String(teacherId) !== req.user.id) {
      return res.status(403).json({ message: 'Teachers can only create their own notifications' });
    }
    const notification = await Notification.create({
      teacherId, type, message, sessionId,
      read: false,
      createdAt: new Date().toISOString(),
    });
    res.status(201).json(notification.toPublic());
  } catch (err) {
    sendError(res, err);
  }
});

// PATCH /api/notifications/:id/read — mark as read (teacher)
router.patch('/:id/read', verifyToken, async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id);
    if (!notification) return res.status(404).json({ message: 'Notification not found' });
    if (isTeacher(req) && notification.teacherId !== req.user.id) {
      return res.status(403).json({ message: 'This notification belongs to another teacher' });
    }
    notification.read = true;
    await notification.save();
    res.json(notification.toPublic());
  } catch (err) {
    sendError(res, err);
  }
});

module.exports = router;

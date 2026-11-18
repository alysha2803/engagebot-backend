const express = require('express');
const router = express.Router();
const AuditLog = require('../models/AuditLog');
const { verifyToken, adminOnly } = require('../middleware/auth');
const sendError = require('../utils/sendError');

// GET /api/audit-logs?entity=students&limit=100&before=<ISO date>
router.get('/', verifyToken, adminOnly, async (req, res) => {
  try {
    const filter = {};
    if (req.query.entity) filter.entity = req.query.entity;
    if (req.query.before) filter.timestamp = { $lt: new Date(req.query.before) };
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    const logs = await AuditLog.find(filter).sort({ timestamp: -1 }).limit(limit).lean();
    res.json(logs.map(l => ({ ...l, id: l._id.toString(), _id: undefined })));
  } catch (err) {
    sendError(res, err);
  }
});

module.exports = router;

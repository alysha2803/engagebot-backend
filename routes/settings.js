const express = require('express');
const router = express.Router();
const Settings = require('../models/Settings');
const { verifyToken, adminOnly } = require('../middleware/auth');
const sendError = require('../utils/sendError');

// GET /api/settings — returns global school settings
router.get('/', verifyToken, async (req, res) => {
  try {
    let settings = await Settings.findOne();
    if (!settings) settings = await Settings.create({ recessTime: '' });
    res.json({ recessTime: settings.recessTime || '' });
  } catch (err) { sendError(res, err); }
});

// PATCH /api/settings — update global settings (admin only)
router.patch('/', verifyToken, adminOnly, async (req, res) => {
  try {
    const { recessTime } = req.body;
    const settings = await Settings.findOneAndUpdate(
      {},
      { recessTime: recessTime ?? '' },
      { new: true, upsert: true }
    );
    res.json({ recessTime: settings.recessTime || '' });
  } catch (err) { sendError(res, err); }
});

module.exports = router;

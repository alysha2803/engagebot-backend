const express = require('express');
const router = express.Router();
const SessionReport = require('../models/SessionReport');
const { verifyToken } = require('../middleware/auth');

// GET /api/reports?date=YYYY-MM-DD
router.get('/', verifyToken, async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ message: 'date query parameter required (YYYY-MM-DD)' });
    const reports = await SessionReport.find({ date }).lean();
    res.json(reports.map(r => ({ ...r, id: r._id.toString(), _id: undefined, __v: undefined })));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/reports/monthly?month=6&year=2026
router.get('/monthly', verifyToken, async (req, res) => {
  try {
    const month = parseInt(req.query.month);
    const year = parseInt(req.query.year);
    if (!month || !year) return res.status(400).json({ message: 'month and year query params required' });

    const prefix = `${year}-${String(month).padStart(2, '0')}`;
    const sessions = await SessionReport.find({
      date: { $gte: `${prefix}-01`, $lte: `${prefix}-31` },
    }).lean();

    const totalSessions = sessions.length;
    const completedSessions = sessions.filter(s => s.status === 'completed').length;
    const avgEngagement = totalSessions > 0
      ? Math.round(sessions.reduce((sum, s) => sum + s.avgFocusScore, 0) / totalSessions)
      : 0;

    const subjectMap = new Map();
    sessions.forEach(s => {
      if (!subjectMap.has(s.subject)) subjectMap.set(s.subject, []);
      subjectMap.get(s.subject).push(s.avgFocusScore);
    });

    const subjectBreakdown = Array.from(subjectMap.entries())
      .map(([subject, scores]) => ({
        subject,
        avgEngagement: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
        sessionCount: scores.length,
      }))
      .sort((a, b) => b.avgEngagement - a.avgEngagement);

    const sessionReports = sessions.map(r => ({ ...r, id: r._id.toString(), _id: undefined, __v: undefined }));

    res.json({ month, year, classGroup: 'all', totalSessions, completedSessions, avgEngagement, subjectBreakdown, sessionReports });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// POST /api/reports — written by droid/AI pipeline
router.post('/', verifyToken, async (req, res) => {
  try {
    const report = await SessionReport.create(req.body);
    res.status(201).json(report.toPublic());
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;

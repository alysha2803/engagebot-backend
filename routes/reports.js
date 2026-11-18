const express = require('express');
const router = express.Router();
const SessionReport = require('../models/SessionReport');
const Student = require('../models/Student');
const { verifyToken, verifyDroidOrToken, canAccessClass, classFilter } = require('../middleware/auth');
const sendError = require('../utils/sendError');
const escapeRegex = require('../utils/escapeRegex');

const WRITABLE_ON_CREATE = [
  'date', 'subject', 'classGroup', 'teacherName', 'droidId', 'startTime', 'endTime',
  'overallEngagement', 'avgFocusScore', 'status', 'studentEngagements', 'droidObservations',
];

const toPublicLean = r => ({ ...r, id: r._id.toString(), _id: undefined, __v: undefined });

// GET /api/reports?date=YYYY-MM-DD
router.get('/', verifyToken, async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ message: 'date query parameter required (YYYY-MM-DD)' });
    // Chronological order (oldest first) -- callers that want "the most
    // recent report" take .last, which only means that with an explicit
    // sort; MongoDB's default order isn't guaranteed to be creation order,
    // and multiple sessions on the same date (e.g. repeated test runs) need
    // this to disambiguate correctly.
    const reports = await SessionReport.find({ date, ...classFilter(req) }).sort({ createdAt: 1 }).lean();
    res.json(reports.map(toPublicLean));
  } catch (err) {
    sendError(res, err);
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
      ...classFilter(req),
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

    res.json({ month, year, classGroup: 'all', totalSessions, completedSessions, avgEngagement, subjectBreakdown, sessionReports: sessions.map(toPublicLean) });
  } catch (err) {
    sendError(res, err);
  }
});

// GET /api/reports/student/:studentId — all reports for one student (any status)
router.get('/student/:studentId', verifyToken, async (req, res) => {
  try {
    const { studentId } = req.params;
    const scope = classFilter(req);
    // Search by studentId first; fall back to studentName if provided as query param.
    const reports = await SessionReport.find({ ...scope, 'studentEngagements.studentId': studentId }).sort({ date: -1 }).lean();

    // If nothing found by ID, try by name (handles ID-format mismatches in the prototype).
    // The name only counts within the student's own class, so namesakes elsewhere don't match.
    if (reports.length === 0 && req.query.name) {
      const student = await Student.findOne({ studentId }).lean();
      const byName = await SessionReport.find({
        $and: [scope, student ? { classGroup: student.classGroup } : {}],
        'studentEngagements.studentName': { $regex: new RegExp(`^${escapeRegex(req.query.name)}$`, 'i') },
      }).sort({ date: -1 }).lean();
      return res.json(byName.map(toPublicLean));
    }

    res.json(reports.map(toPublicLean));
  } catch (err) {
    sendError(res, err);
  }
});

// GET /api/reports/class/:classGroup/latest — the single most recent report
// for this class, in full, regardless of status or "today". Exists because
// filtering by today's date using the CLIENT's own local clock (as the
// dashboard's old approach did) is timezone-fragile -- a device clock that
// disagrees with the server/droid's Malaysia time silently picks the wrong
// "today" and returns a stale report. Sorting by true creation time and
// taking the first is timezone-independent and always correct.
router.get('/class/:classGroup/latest', verifyToken, async (req, res) => {
  try {
    const { classGroup } = req.params;
    if (!canAccessClass(req, classGroup)) {
      return res.status(403).json({ message: 'You are not assigned to this class' });
    }
    const report = await SessionReport.findOne({ classGroup }).sort({ createdAt: -1 });
    if (!report) return res.status(404).json({ message: 'No reports found for this class' });
    res.json(report.toPublic());
  } catch (err) {
    sendError(res, err);
  }
});

// GET /api/reports/class/:classGroup — engagement summary across all sessions for a class
router.get('/class/:classGroup', verifyToken, async (req, res) => {
  try {
    const { classGroup } = req.params;
    if (!canAccessClass(req, classGroup)) {
      return res.status(403).json({ message: 'You are not assigned to this class' });
    }
    const { date } = req.query;
    const match = { classGroup };
    if (date) match.date = date;
    // Sort newest-first by actual creation time, not the `date` string --
    // multiple sessions on the same date (e.g. repeated test runs) need
    // createdAt to disambiguate which one is really the most recent; the
    // "first occurrence of each student = their latest score" logic below
    // depends on this being correct.
    const reports = await SessionReport.find(match).sort({ createdAt: -1 }).lean();

    if (reports.length === 0) {
      return res.json({ classGroup, avgFocusScore: 0, totalSessions: 0, studentBreakdown: [] });
    }

    const totalSessions = reports.length;
    const avgFocusScore = Math.round(
      reports.reduce((sum, r) => sum + (r.avgFocusScore || 0), 0) / totalSessions
    );
    // The latest single session's own stored values -- what the app shows
    // as "the current engagement %", distinct from avgFocusScore above
    // (which is an average ACROSS all sessions ever held for this class).
    const latestAvgFocusScore = reports[0].avgFocusScore || 0;
    const latestOverallEngagement = reports[0].overallEngagement || 'medium';

    const studentMap = new Map();
    for (const report of reports) {
      for (const se of (report.studentEngagements || [])) {
        if (!studentMap.has(se.studentId)) {
          studentMap.set(se.studentId, {
            studentId: se.studentId,
            studentName: se.studentName,
            // First seen = most recent (reports sorted desc above).
            latestFocusScore: se.focusScore || 0,
            latestParticipationScore: se.participationScore || 0,
            latestEngagementLevel: se.engagementLevel || 'medium',
            scores: [],
            distractedCount: 0,
          });
        }
        const entry = studentMap.get(se.studentId);
        entry.scores.push(se.focusScore || 0);
        entry.distractedCount += se.distractedCount || 0;
      }
    }

    const studentBreakdown = Array.from(studentMap.values()).map(s => ({
      studentId: s.studentId,
      studentName: s.studentName,
      latestFocusScore: s.latestFocusScore,
      latestParticipationScore: s.latestParticipationScore,
      latestEngagementLevel: s.latestEngagementLevel,
      avgFocusScore: Math.round(s.scores.reduce((a, b) => a + b, 0) / s.scores.length),
      sessions: s.scores.length,
      distractedCount: s.distractedCount,
    }));

    res.json({ classGroup, avgFocusScore, latestAvgFocusScore, latestOverallEngagement, totalSessions, studentBreakdown });
  } catch (err) {
    sendError(res, err);
  }
});

// POST /api/reports — written by droid/AI pipeline (X-Droid-Key), an admin, or the class's teacher
router.post('/', verifyDroidOrToken, async (req, res) => {
  try {
    const body = {};
    for (const key of WRITABLE_ON_CREATE) {
      if (req.body[key] !== undefined) body[key] = req.body[key];
    }
    if (!canAccessClass(req, body.classGroup)) {
      return res.status(403).json({ message: 'You are not assigned to this class' });
    }
    const report = await SessionReport.create(body);
    res.status(201).json(report.toPublic());
  } catch (err) {
    sendError(res, err);
  }
});

// PATCH /api/reports/:id — live update from droid prototype
router.patch('/:id', verifyDroidOrToken, async (req, res) => {
  try {
    const allowed = [
      'status', 'endTime', 'overallEngagement', 'avgFocusScore',
      'studentEngagements', 'droidObservations', 'noiseDistribution', 'engagementBreakdown',
    ];
    const patch = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) patch[key] = req.body[key];
    }
    const report = await SessionReport.findById(req.params.id);
    if (!report) return res.status(404).json({ message: 'Report not found' });
    if (!canAccessClass(req, report.classGroup)) {
      return res.status(403).json({ message: 'You are not assigned to this class' });
    }
    report.set(patch);
    await report.save(); // save(), not findByIdAndUpdate: the model's hook derives endedAt from endTime
    res.json(report.toPublic());
  } catch (err) {
    sendError(res, err);
  }
});

module.exports = router;

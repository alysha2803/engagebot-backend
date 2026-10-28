const express = require('express');
const router = express.Router();
const Student = require('../models/Student');
const SessionReport = require('../models/SessionReport');
const { verifyToken, adminOnly } = require('../middleware/auth');

async function nextStudentId() {
  const count = await Student.countDocuments();
  return `STU-${String(count + 1).padStart(5, '0')}`;
}

// Derive engagement category from a 0-100 focus score.
function scoreToEngagement(score) {
  if (score >= 65) return 'engaged';
  if (score >= 35) return 'distracted';
  return 'flagged';
}

// GET /api/students — list students, enriched with computed engagementLevel
router.get('/', verifyToken, async (req, res) => {
  try {
    const filter = {};
    if (req.query.classGroup) filter.classGroup = req.query.classGroup;
    const students = await Student.find(filter).lean();

    if (students.length === 0) return res.json([]);

    // Fetch all session reports for the relevant class groups (newest first).
    const classGroups = [...new Set(students.map(s => s.classGroup))];
    const reports = await SessionReport.find({ classGroup: { $in: classGroups } })
      .sort({ date: -1 })
      .lean();

    // Build lookup maps — first occurrence per key = most recent score.
    // Match by _id string first (if droid stores it), then by normalised name.
    const byId   = {};  // studentId string → focusScore
    const byName = {};  // lower-case name  → focusScore

    for (const report of reports) {
      for (const eng of (report.studentEngagements || [])) {
        const score = typeof eng.focusScore === 'number' ? eng.focusScore : null;
        if (score === null) continue;

        const sid = eng.studentId;
        if (sid && byId[sid] === undefined) byId[sid] = score;

        const sname = (eng.studentName || '').trim().toLowerCase();
        if (sname && byName[sname] === undefined) byName[sname] = score;
      }
    }

    res.json(students.map(s => {
      const sid   = s._id.toString();
      const sname = s.name.trim().toLowerCase();

      let focusScore = null;
      if (byId[sid] !== undefined)       focusScore = byId[sid];
      else if (byName[sname] !== undefined) focusScore = byName[sname];

      return {
        ...s,
        id: sid,
        _id: undefined,
        __v: undefined,
        // Computed from real droid data; null when no session data exists.
        engagementLevel: focusScore !== null ? scoreToEngagement(focusScore) : null,
      };
    }));
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

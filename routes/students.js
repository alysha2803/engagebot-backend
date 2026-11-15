const express = require('express');
const crypto = require('crypto');
const mongoose = require('mongoose');
const router = express.Router();
const Student = require('../models/Student');
const SessionReport = require('../models/SessionReport');
const { verifyToken, adminOnly, isTeacher, canAccessClass } = require('../middleware/auth');
const { verifyDroid } = require('../middleware/droidAuth');
const sendError = require('../utils/sendError');
const nextSequence = require('../utils/sequence');

async function nextStudentId() {
  const seq = await nextSequence('studentId', async () => {
    const last = await Student.findOne({}, { studentId: 1 }).sort({ studentId: -1 }).lean();
    return last ? parseInt(last.studentId.replace('STU-', ''), 10) || 0 : 0;
  });
  return `STU-${String(seq).padStart(5, '0')}`;
}

// Derive engagement category from a 0-100 focus score.
function scoreToEngagement(score) {
  if (score >= 65) return 'engaged';
  if (score >= 35) return 'distracted';
  return 'flagged';
}

const nameKey = (classGroup, name) => `${classGroup}|${(name || '').trim().toLowerCase()}`;

// GET /api/students — list students, enriched with computed engagementLevel.
// Teachers only get their assigned classes, and never IC numbers.
router.get('/', verifyToken, async (req, res) => {
  try {
    const { classGroup } = req.query;
    if (classGroup && !canAccessClass(req, classGroup)) {
      return res.status(403).json({ message: 'You are not assigned to this class' });
    }
    const filter = {};
    if (classGroup) filter.classGroup = classGroup;
    else if (isTeacher(req)) filter.classGroup = { $in: req.assignedClasses };

    const students = await Student.find(filter).select(isTeacher(req) ? '-icNumber' : '').lean();

    if (students.length === 0) return res.json([]);

    // Fetch all session reports for the relevant class groups (newest first).
    const classGroups = [...new Set(students.map(s => s.classGroup))];
    const reports = await SessionReport.find({ classGroup: { $in: classGroups } })
      .sort({ date: -1 })
      .lean();

    // Build lookup maps — first occurrence per key = most recent score.
    // Match by id first. Names are a fallback for prototype data, within one class only.
    const byId   = {};  // studentId string → focusScore
    const byName = {};  // class + lower-case name → focusScore

    for (const report of reports) {
      for (const eng of (report.studentEngagements || [])) {
        const score = typeof eng.focusScore === 'number' ? eng.focusScore : null;
        if (score === null) continue;

        const sid = eng.studentId;
        if (sid && byId[sid] === undefined) byId[sid] = score;

        const key = nameKey(report.classGroup, eng.studentName);
        if (eng.studentName && byName[key] === undefined) byName[key] = score;
      }
    }

    // Students sharing a name in one class can't be told apart, so they never use the name fallback.
    const nameCounts = {};
    for (const s of students) {
      const key = nameKey(s.classGroup, s.name);
      nameCounts[key] = (nameCounts[key] || 0) + 1;
    }

    res.json(students.map(s => {
      const sid = s._id.toString();
      const key = nameKey(s.classGroup, s.name);

      let focusScore = null;
      if (byId[sid] !== undefined) focusScore = byId[sid];
      else if (byId[s.studentId] !== undefined) focusScore = byId[s.studentId];
      else if (nameCounts[key] === 1 && byName[key] !== undefined) focusScore = byName[key];

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
    sendError(res, err);
  }
});

// GET /api/students/person-ids?classGroup=5A — droid fetches a class's anonymous IDs (no names or ICs)
router.get('/person-ids', verifyDroid, async (req, res) => {
  try {
    const { classGroup } = req.query;
    if (!classGroup) return res.status(400).json({ message: 'classGroup query parameter required' });

    const students = await Student.find({ classGroup }).select('+personId studentId classGroup').lean();
    for (const student of students) {
      if (student.personId) continue; // students created before anonymous IDs existed get one now
      student.personId = crypto.randomUUID();
      await Student.updateOne({ _id: student._id }, { personId: student.personId });
    }
    res.json(students.map(s => ({ personId: s.personId, studentId: s.studentId, classGroup: s.classGroup })));
  } catch (err) {
    sendError(res, err);
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
    sendError(res, err);
  }
});

// PATCH /api/students/:id — admins edit any field; teachers can only correct names in their classes
router.patch('/:id', verifyToken, async (req, res) => {
  try {
    const teacher = isTeacher(req);
    const allowed = teacher ? ['name'] : ['name', 'icNumber', 'classGroup', 'status'];
    const patch = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) patch[key] = req.body[key];
    }

    const existing = await Student.findById(req.params.id);
    if (!existing) return res.status(404).json({ message: 'Student not found' });
    if (!canAccessClass(req, existing.classGroup)) {
      return res.status(403).json({ message: 'You are not assigned to this class' });
    }

    existing.set(patch);
    await existing.save();
    const body = existing.toPublic();
    if (teacher) delete body.icNumber;
    res.json(body);
  } catch (err) {
    sendError(res, err);
  }
});

// DELETE /api/students/:id — removes the student and their results from session reports.
// Research data keeps only the anonymous person ID, whose link to this student is deleted here.
router.delete('/:id', verifyToken, adminOnly, async (req, res) => {
  try {
    const student = await Student.findById(req.params.id).select('+personId');
    if (!student) return res.status(404).json({ message: 'Student not found' });
    const ids = [student._id.toString(), student.studentId, student.personId].filter(Boolean);

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await SessionReport.updateMany(
          { 'studentEngagements.studentId': { $in: ids } },
          { $pull: { studentEngagements: { studentId: { $in: ids } } } },
          { session },
        );
        await Student.deleteOne({ _id: student._id }, { session });
      });
    } finally {
      await session.endSession();
    }
    res.json({ message: 'Student deleted' });
  } catch (err) {
    sendError(res, err);
  }
});

module.exports = router;

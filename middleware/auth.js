const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');
const Teacher = require('../models/Teacher');
const { isValidDroidKey } = require('./droidAuth');

// Tokens outlive accounts, so each request also confirms the account still exists and is active.
async function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'No token provided' });

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }

  try {
    if (payload.role === 'teacher') {
      const teacher = await Teacher.findById(payload.id, 'assignedClasses status isActive').lean();
      if (!teacher || !teacher.isActive || teacher.status === 'inactive') {
        return res.status(401).json({ message: 'This account is no longer active' });
      }
      req.assignedClasses = teacher.assignedClasses || [];
    } else if (!(await Admin.exists({ _id: payload.id }))) {
      return res.status(401).json({ message: 'This account is no longer active' });
    }
  } catch (err) {
    console.error(err);
    return res.status(503).json({ message: 'Could not verify account' });
  }

  req.user = payload;
  next();
}

// For routes used by both droids (X-Droid-Key) and logged-in users (JWT).
function verifyDroidOrToken(req, res, next) {
  if (req.headers['x-droid-key'] === undefined) return verifyToken(req, res, next);
  if (!isValidDroidKey(req.headers['x-droid-key'])) {
    return res.status(401).json({ message: 'Invalid or missing droid key' });
  }
  req.droid = true;
  next();
}

function adminOnly(req, res, next) {
  if (req.user?.role !== 'admin' && req.user?.role !== 'super_admin') {
    return res.status(403).json({ message: 'Admin access required' });
  }
  next();
}

function teacherOnly(req, res, next) {
  if (req.user?.role !== 'teacher') {
    return res.status(403).json({ message: 'Teacher access required' });
  }
  next();
}

const isTeacher = req => req.user?.role === 'teacher';

// Teachers only reach classes they are assigned to; admins and droids reach all of them.
const canAccessClass = (req, classGroup) => !isTeacher(req) || req.assignedClasses.includes(classGroup);

// Same rule as a query filter for collections with a classGroup field.
const classFilter = req => (isTeacher(req) ? { classGroup: { $in: req.assignedClasses } } : {});

module.exports = { verifyToken, verifyDroidOrToken, adminOnly, teacherOnly, isTeacher, canAccessClass, classFilter };

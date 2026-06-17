const jwt = require('jsonwebtoken');

function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'No token provided' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ message: 'Invalid or expired token' });
  }
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

module.exports = { verifyToken, adminOnly, teacherOnly };

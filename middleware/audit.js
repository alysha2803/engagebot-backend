const AuditLog = require('../models/AuditLog');

const ACTIONS = { POST: 'create', PATCH: 'update', PUT: 'update', DELETE: 'delete', GET: 'view' };
// Reads are only logged where personal data is exposed.
const LOGGED_READS = ['students', 'reports', 'emotion', 'audit-logs'];

// Records one entry after each response. Droid uploads are not logged (dozens per minute, no personal data).
function auditLog(req, res, next) {
  res.on('finish', () => {
    const [, entity, ...rest] = req.originalUrl.split('?')[0].split('/').filter(Boolean);
    if (!entity) return;

    const isLogin = entity === 'auth' && rest[1] === 'login';
    if (isLogin ? res.statusCode === 429 : (!req.user || res.statusCode >= 400)) return;
    if (!isLogin && req.method === 'GET' && !LOGGED_READS.includes(entity)) return;

    const attemptedEmail = isLogin && typeof req.body?.email === 'string' ? req.body.email : null;
    AuditLog.create({
      userId: req.user?.id ?? null,
      role: req.user?.role ?? null,
      email: req.user?.email ?? attemptedEmail,
      action: isLogin ? (res.statusCode < 400 ? 'login' : 'login_failed') : ACTIONS[req.method] || req.method,
      entity,
      targetId: isLogin ? null : rest.join('/') || null,
      statusCode: res.statusCode,
      ip: req.ip,
    }).catch(err => console.error('Audit log write failed:', err.message));
  });
  next();
}

module.exports = auditLog;

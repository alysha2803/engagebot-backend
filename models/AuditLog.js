const mongoose = require('mongoose');

// PDPA audit trail. Request bodies and query strings are never stored.
const auditLogSchema = new mongoose.Schema({
  userId: { type: String, default: null },
  role: { type: String, default: null },
  email: { type: String, default: null },
  action: { type: String, required: true }, // view | create | update | delete | login | login_failed
  entity: { type: String, required: true },
  targetId: { type: String, default: null },
  statusCode: { type: Number },
  ip: { type: String },
  timestamp: { type: Date, default: Date.now, index: true },
}, { versionKey: false });

auditLogSchema.index({ entity: 1, timestamp: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);

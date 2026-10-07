const mongoose = require('mongoose');

const studentEngagementSchema = new mongoose.Schema({
  studentId: String,
  studentName: String,
  engagementLevel: { type: String, enum: ['high', 'medium', 'low', 'absent'] },
  focusScore: Number,
  distractedCount: Number,
  participationScore: Number,
}, { _id: false });

const droidObservationSchema = new mongoose.Schema({
  timestamp: String,
  note: String,
  type: { type: String, enum: ['engagement', 'distraction', 'participation', 'general'] },
}, { _id: false });

const sessionReportSchema = new mongoose.Schema({
  date: { type: String, required: true },
  subject: { type: String, required: true },
  classGroup: { type: String, required: true },
  teacherName: { type: String },
  droidId: { type: String },
  startTime: { type: String },
  endTime: { type: String },
  // Real timestamps derived from date + startTime/endTime (Malaysia time, stored as UTC).
  // The string fields above are kept for the admin web app and date-string queries.
  startedAt: { type: Date },
  endedAt: { type: Date },
  overallEngagement: { type: String, enum: ['high', 'medium', 'low', 'absent'] },
  avgFocusScore: { type: Number, default: 0 },
  status: { type: String, enum: ['completed', 'in_progress'], default: 'in_progress' },
  studentEngagements: [studentEngagementSchema],
  droidObservations: [droidObservationSchema],
}, { timestamps: true });

const MYT_OFFSET = '+08:00';

// Combines 'YYYY-MM-DD' and 'HH:MM' (or 'HH:MM:SS') into a Date, or undefined if either is malformed.
function toTimestamp(date, time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return undefined;
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec((time || '').trim());
  if (!match) return undefined;
  const [, h, m, s = '00'] = match;
  const parsed = new Date(`${date}T${h.padStart(2, '0')}:${m}:${s}${MYT_OFFSET}`);
  return isNaN(parsed) ? undefined : parsed;
}

sessionReportSchema.pre('validate', function (next) {
  if (this.isModified('date') || this.isModified('startTime')) this.startedAt = toTimestamp(this.date, this.startTime);
  if (this.isModified('date') || this.isModified('endTime')) this.endedAt = toTimestamp(this.date, this.endTime);
  next();
});

sessionReportSchema.statics.toTimestamp = toTimestamp;

sessionReportSchema.methods.toPublic = function () {
  const obj = this.toObject();
  obj.id = obj._id.toString();
  delete obj._id;
  delete obj.__v;
  return obj;
};

module.exports = mongoose.model('SessionReport', sessionReportSchema);

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
  overallEngagement: { type: String, enum: ['high', 'medium', 'low', 'absent'] },
  avgFocusScore: { type: Number, default: 0 },
  status: { type: String, enum: ['completed', 'in_progress'], default: 'in_progress' },
  studentEngagements: [studentEngagementSchema],
  droidObservations: [droidObservationSchema],
}, { timestamps: true });

sessionReportSchema.methods.toPublic = function () {
  const obj = this.toObject();
  obj.id = obj._id.toString();
  delete obj._id;
  delete obj.__v;
  return obj;
};

module.exports = mongoose.model('SessionReport', sessionReportSchema);

const mongoose = require('mongoose');

const classScheduleSchema = new mongoose.Schema({
  subject: { type: String, required: true },
  teacherId: { type: String, required: true },
  teacherName: { type: String, required: true },
  classGroup: { type: String, required: true },
  startTime: { type: String, required: true },
  endTime: { type: String, required: true },
  day: { type: String, enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'], required: true },
  status: { type: String, enum: ['ongoing', 'scheduled', 'completed'], default: 'scheduled' },
  color: { type: String },
  checkedIn: { type: Boolean },
  checkInTime: { type: String },
}, { timestamps: true });

classScheduleSchema.methods.toPublic = function () {
  const obj = this.toObject();
  obj.id = obj._id.toString();
  delete obj._id;
  delete obj.__v;
  return obj;
};

module.exports = mongoose.model('ClassSchedule', classScheduleSchema);

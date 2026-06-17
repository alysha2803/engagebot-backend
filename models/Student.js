const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
  name: { type: String, required: true },
  icNumber: { type: String, required: true },
  classGroup: { type: String, required: true },
  source: { type: String, enum: ['manual', 'csv'], default: 'manual' },
  status: { type: String, enum: ['verified', 'pending', 'error'], default: 'pending' },
  studentId: { type: String, unique: true },
  batchId: { type: String },
}, { timestamps: true });

studentSchema.methods.toPublic = function () {
  const obj = this.toObject();
  obj.id = obj._id.toString();
  delete obj._id;
  delete obj.__v;
  return obj;
};

module.exports = mongoose.model('Student', studentSchema);

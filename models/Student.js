const crypto = require('crypto');
const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
  name: { type: String, required: true },
  icNumber: { type: String, required: true },
  classGroup: { type: String, required: true },
  source: { type: String, enum: ['manual', 'csv'], default: 'manual' },
  status: { type: String, enum: ['verified', 'pending', 'error'], default: 'pending' },
  studentId: { type: String, unique: true },
  batchId: { type: String },
  // One embedding vector per enrollment photo (e.g. ArcFace, 512-d). Multiple
  // vectors per student improve match robustness across angles/lighting.
  faceEmbeddings: { type: [[Number]], default: undefined },
  faceEnrolledAt: { type: Date },
  // Anonymous ID used in the research database. This field is the only link back to the student.
  personId: { type: String, unique: true, sparse: true, select: false, default: () => crypto.randomUUID() },
}, { timestamps: true });

studentSchema.methods.toPublic = function () {
  const obj = this.toObject();
  obj.id = obj._id.toString();
  delete obj._id;
  delete obj.__v;
  // Biometric data — never broadcast on general student reads; only the
  // dedicated face-embeddings endpoint (used by the droid for matching) sees it.
  delete obj.faceEmbeddings;
  delete obj.personId;
  return obj;
};

module.exports = mongoose.model('Student', studentSchema);

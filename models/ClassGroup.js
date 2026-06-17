const mongoose = require('mongoose');

const classGroupSchema = new mongoose.Schema({
  name: { type: String, required: true },
  academicYear: { type: Number, required: true },
  room: { type: String, default: '' },
  droidId: { type: String },
  recessTime: { type: String, default: '' },
}, { timestamps: true });

classGroupSchema.methods.toPublic = function () {
  const obj = this.toObject();
  obj.id = obj._id.toString();
  delete obj._id;
  delete obj.__v;
  return obj;
};

module.exports = mongoose.model('ClassGroup', classGroupSchema);

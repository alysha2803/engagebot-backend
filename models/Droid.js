const mongoose = require('mongoose');

const droidSchema = new mongoose.Schema({
  droidId: { type: String, unique: true },
  serialNumber: { type: String, required: true },
  assignedRoom: { type: String, default: 'Unassigned' },
  firmware: { type: String, default: 'v1.0.0' },
  battery: { type: Number, default: 0 },
  lastPing: { type: String, default: 'Waiting for first ping…' },
  status: { type: String, enum: ['active', 'inactive', 'offline'], default: 'inactive' },
  telemetryNotes: { type: String },
}, { timestamps: true });

droidSchema.methods.toPublic = function () {
  const obj = this.toObject();
  obj.id = obj._id.toString();
  delete obj._id;
  delete obj.__v;
  return obj;
};

module.exports = mongoose.model('Droid', droidSchema);

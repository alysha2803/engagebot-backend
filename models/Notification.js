const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  teacherId: { type: String, required: true },
  type: { type: String, enum: ['relief', 'late'], required: true },
  message: { type: String, required: true },
  sessionId: { type: String },
  read: { type: Boolean, default: false },
  createdAt: { type: String, default: () => new Date().toISOString() },
}, { timestamps: false });

notificationSchema.methods.toPublic = function () {
  const obj = this.toObject();
  obj.id = obj._id.toString();
  delete obj._id;
  delete obj.__v;
  return obj;
};

module.exports = mongoose.model('Notification', notificationSchema);

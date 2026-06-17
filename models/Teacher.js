const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const teacherSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  department: { type: String, default: '' },
  subjects: { type: [String], default: [] },
  school: { type: String, default: '' },
  assignedClasses: { type: [String], default: [] },
  employeeId: { type: String, unique: true },
  dateAdded: { type: String, default: () => new Date().toISOString().split('T')[0] },
  status: { type: String, enum: ['active', 'pending', 'inactive'], default: 'pending' },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

teacherSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

teacherSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

// Strip password from all API responses
teacherSchema.methods.toPublic = function () {
  const obj = this.toObject();
  delete obj.password;
  obj.id = obj._id.toString();
  delete obj._id;
  delete obj.__v;
  return obj;
};

module.exports = mongoose.model('Teacher', teacherSchema);

const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  recessTime: { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('Settings', settingsSchema);

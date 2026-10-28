const mongoose = require('mongoose');
const emotionConn = require('../../db/emotion');

const segmentSchema = new mongoose.Schema({
  segment_id: { type: String, required: true },
  session_id: { type: String, required: true },
  person_id: { type: String, required: true }, // TODO(step 2): pseudonymise before storing
  scene_type: { type: String, enum: ['classroom', 'eldercare'], required: true },
  session_start_time: { type: Date, required: true },
  start_offset_sec: { type: Number, required: true, min: 0 },
  end_offset_sec: {
    type: Number, required: true, min: 0,
    validate: {
      validator: function (v) { return this.start_offset_sec == null || v >= this.start_offset_sec; },
      message: 'end_offset_sec must be >= start_offset_sec',
    },
  },
  _source_video: { type: String },
}, { strict: 'throw', versionKey: false });

module.exports = emotionConn.model('Segment', segmentSchema, 'segments');

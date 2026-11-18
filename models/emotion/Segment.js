const mongoose = require('mongoose');
const emotionConn = require('../../db/emotion');

// Research data never holds names: a person is a random UUID, or 'classroom' for class-wide noise segments.
const PERSON_ID = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|classroom)$/i;

const segmentSchema = new mongoose.Schema({
  segment_id: { type: String, required: true, unique: true },
  session_id: { type: String, required: true },
  person_id: { type: String, required: true, match: [PERSON_ID, 'person_id must be a UUID or "classroom"'] },
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

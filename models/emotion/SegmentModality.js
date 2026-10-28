const mongoose = require('mongoose');
const emotionConn = require('../../db/emotion');

const segmentModalitySchema = new mongoose.Schema({
  segment_id: { type: String, required: true },
  video_available: { type: Boolean },
  video_source_uri: { type: String },
  video_fps: { type: Number },
  video_frame_count: { type: Number },
  video_duration_sec: { type: Number },
  video_resolution: { type: String },
  audio_available: { type: Boolean },
  audio_source_uri: { type: String },
  audio_sample_rate: { type: Number },
  audio_duration_sec: { type: Number },
  text_available: { type: Boolean },
}, { strict: 'throw', versionKey: false });

module.exports = emotionConn.model('SegmentModality', segmentModalitySchema, 'segment_modalities');

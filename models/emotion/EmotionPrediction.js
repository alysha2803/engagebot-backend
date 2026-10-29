const mongoose = require('mongoose');
const emotionConn = require('../../db/emotion');

// Output of the YOLOv8 emotion classifier for one student segment.
// teacher_label is the teacher's correction — the ground truth Zhang can evaluate models against.
const emotionPredictionSchema = new mongoose.Schema({
  segment_id: { type: String, required: true },
  extractor: { type: String },        // e.g. 'yolov8n-cls-engagebot'
  schema: { type: String },
  model_version: { type: String, required: true },
  predicted_label: { type: String, required: true },
  probabilities: { type: Map, of: Number, required: true }, // e.g. { focused: 0.72, distracted: 0.2, anxious: 0.08 }
  confidence: { type: Number, required: true, min: 0, max: 1 },
  low_confidence: { type: Boolean, default: false },
  frames_used: { type: Number },
  teacher_label: { type: String, default: null },
}, { strict: 'throw', versionKey: false, suppressReservedKeysWarning: true });

module.exports = emotionConn.model('EmotionPrediction', emotionPredictionSchema, 'emotion_predictions');

const mongoose = require('mongoose');
const emotionConn = require('../../db/emotion');

const poseFeatureSchema = new mongoose.Schema({
  segment_id: { type: String, required: true },
  extractor: { type: String },
  pose_detected_ratio: { type: Number },
  shoulder_width_mean: { type: Number },
  torso_center_motion_mean: { type: Number },
  body_lean_x_mean: { type: Number },
  body_lean_y_mean: { type: Number },
  hand_raise_ratio: { type: Number },
}, { strict: 'throw', versionKey: false });

module.exports = emotionConn.model('PoseFeature', poseFeatureSchema, 'pose_features');

const mongoose = require('mongoose');
const emotionConn = require('../../db/emotion');

// Facial Action Units from the ERD (OpenFace intensity, *_r = regression)
const ACTION_UNITS = ['01', '02', '04', '05', '06', '07', '09', '10', '12', '14', '15', '17', '20', '23', '25', '26', '45'];
const auFields = {};
for (const au of ACTION_UNITS) auFields[`AU${au}_r_mean`] = { type: Number };

const openFaceFeatureSchema = new mongoose.Schema({
  segment_id: { type: String, required: true },
  extractor: { type: String },
  schema: { type: String },
  face_detection_confidence_mean: { type: Number },
  face_detection_success_ratio: { type: Number },
  openface_frame_count: { type: Number },
  pose_Rx_mean: { type: Number },
  pose_Ry_mean: { type: Number },
  pose_Rz_mean: { type: Number },
  gaze_angle_x_mean: { type: Number },
  gaze_angle_y_mean: { type: Number },
  ...auFields,
}, { strict: 'throw', versionKey: false, suppressReservedKeysWarning: true });

module.exports = emotionConn.model('OpenFaceFeature', openFaceFeatureSchema, 'openface_features');

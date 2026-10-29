const mongoose = require('mongoose');
const emotionConn = require('../../db/emotion');

// First 11 YOLOv8-pose (COCO) keypoints — the upper body. Hips/legs are usually hidden by desks.
const UPPER_BODY_KEYPOINTS = [
  'nose', 'left_eye', 'right_eye', 'left_ear', 'right_ear',
  'left_shoulder', 'right_shoulder', 'left_elbow', 'right_elbow', 'left_wrist', 'right_wrist',
];

const boxSchema = new mongoose.Schema({
  x: Number, y: Number, w: Number, h: Number,
}, { _id: false, strict: 'throw' });

const poseFeatureSchema = new mongoose.Schema({
  segment_id: { type: String, required: true },
  extractor: { type: String },
  pose_detected_ratio: { type: Number },
  shoulder_width_mean: { type: Number },
  torso_center_motion_mean: { type: Number },
  body_lean_x_mean: { type: Number },
  body_lean_y_mean: { type: Number },
  hand_raise_ratio: { type: Number },

  // EngageBot additions (approved by Zhang) — Zhang's code ignores these, so merging still works
  schema: { type: String },          // 'v1.0-eb' marks documents that carry the additions
  frame_offset_sec: { type: Number }, // clearest frame in the window, used for the keypoints below
  person_box: { type: boxSchema },    // where the student was in the full frame (0–1)
  upper_body_keypoints: {             // [x, y, confidence] per UPPER_BODY_KEYPOINTS entry, relative to person_box
    type: [[Number]],
    default: undefined,
    validate: {
      validator: pts => pts.length === UPPER_BODY_KEYPOINTS.length && pts.every(p => p.length === 3),
      message: `upper_body_keypoints must be ${UPPER_BODY_KEYPOINTS.length} points of [x, y, confidence]`,
    },
  },
  hand_near_face_ratio: { type: Number },
  head_down_ratio: { type: Number },
  head_turned_ratio: { type: Number },
  fidget_score: { type: Number },
  arms_crossed_ratio: { type: Number },
}, { strict: 'throw', versionKey: false, suppressReservedKeysWarning: true });

module.exports = emotionConn.model('PoseFeature', poseFeatureSchema, 'pose_features');
module.exports.UPPER_BODY_KEYPOINTS = UPPER_BODY_KEYPOINTS;

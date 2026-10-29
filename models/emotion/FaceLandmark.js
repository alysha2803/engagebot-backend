const mongoose = require('mongoose');
const emotionConn = require('../../db/emotion');

const LANDMARK_COUNT = 478; // MediaPipe Face Landmarker (468 face + 10 iris)

const boxSchema = new mongoose.Schema({
  x: Number, y: Number, w: Number, h: Number,
}, { _id: false, strict: 'throw' });

// MediaPipe face points from the clearest frame of the segment, relative to the face crop,
// so the same expression gives the same numbers wherever the student sits.
// Readable arrays for testing — Zhang may switch to packed binary later.
const faceLandmarkSchema = new mongoose.Schema({
  segment_id: { type: String, required: true },
  extractor: { type: String },        // e.g. 'mediapipe_face_landmarker'
  schema: { type: String },
  frame_offset_sec: { type: Number },
  face_box: { type: boxSchema },      // where the face was in the full frame (0–1)
  landmarks: {                        // [[x, y, z], ...]
    type: [[Number]],
    default: undefined,
    required: true,
    validate: {
      validator: pts => pts.length === LANDMARK_COUNT && pts.every(p => p.length === 3),
      message: `landmarks must be ${LANDMARK_COUNT} points of [x, y, z]`,
    },
  },
  blendshapes: { type: Map, of: Number }, // 52 MediaPipe scores, 0–1
  face_detection_confidence: { type: Number },
}, { strict: 'throw', versionKey: false, suppressReservedKeysWarning: true });

module.exports = emotionConn.model('FaceLandmark', faceLandmarkSchema, 'face_landmarks');

const mongoose = require('mongoose');
const emotionConn = require('../../db/emotion');

const mfccFields = {};
for (let i = 0; i <= 12; i++) mfccFields[`mfcc_mean_${i}`] = { type: Number };

const voiceFeatureSchema = new mongoose.Schema({
  segment_id: { type: String, required: true },
  extractor: { type: String },
  schema: { type: String },
  pitch_mean_hz: { type: Number },
  pitch_std_hz: { type: Number },
  pitch_range_hz: { type: Number },
  energy_mean: { type: Number },
  energy_std: { type: Number },
  pause_ratio: { type: Number },
  zero_crossing_rate_mean: { type: Number },
  spectral_centroid_mean: { type: Number },
  ...mfccFields,
}, { strict: 'throw', versionKey: false, suppressReservedKeysWarning: true });

module.exports = emotionConn.model('VoiceFeature', voiceFeatureSchema, 'voice_features');

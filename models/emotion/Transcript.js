const mongoose = require('mongoose');
const emotionConn = require('../../db/emotion');

const transcriptSchema = new mongoose.Schema({
  segment_id: { type: String, required: true },
  extractor: { type: String },
  text: { type: String },
  language: { type: String },
  segment_count: { type: Number },
  word_count: { type: Number },
  avg_logprob_mean: { type: Number },
  no_speech_prob_mean: { type: Number },
}, { strict: 'throw', versionKey: false });

module.exports = emotionConn.model('Transcript', transcriptSchema, 'transcript');

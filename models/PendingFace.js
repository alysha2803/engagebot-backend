const mongoose = require('mongoose');

// An auto-enrolled, not-yet-named face identity (Phase 8 follow-up: "open-set"
// recognition). Created by the droid the first time it sees a face that
// doesn't confidently match anyone -- real student OR another pending face --
// instead of requiring a pre-supplied photo for every student. A teacher
// later labels it with a real student name via the app (see routes below),
// at which point its embeddings are merged into that Student and this
// document is deleted -- it's a temporary review artifact, not meant to be
// kept once labeled (data minimization).
const pendingFaceSchema = new mongoose.Schema({
  classGroup: { type: String, required: true },
  // Same shape as Student.faceEmbeddings -- one vector per sighting.
  embeddings: { type: [[Number]], required: true },
  // Small JPEG, base64-encoded, for the teacher to recognize at a glance when
  // labeling. Not a biometric template -- just a thumbnail for human review.
  thumbnail: { type: String },
  sightCount: { type: Number, default: 1 },
  lastSeenAt: { type: Date, default: Date.now },
  // Other PendingFace ids the teacher has already said "not the same person"
  // as this one -- so a dismissed merge suggestion never resurfaces for
  // that pair (Photos-People-style "is this the same person?" prompt).
  dismissedMerges: { type: [String], default: [] },
}, { timestamps: true });

pendingFaceSchema.methods.toPublic = function () {
  const obj = this.toObject();
  obj.id = obj._id.toString();
  delete obj._id;
  delete obj.__v;
  // Embeddings are only needed by the droid for matching, not by the app's
  // labeling UI -- keep the labeling-list response small.
  delete obj.embeddings;
  return obj;
};

module.exports = mongoose.model('PendingFace', pendingFaceSchema);

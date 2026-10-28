// Separate connection to Zhang's research database (Emotion_Data).
// Kept apart from the main EngageBot connection so research data never mixes with app data,
// and so an outage on his cluster does not take the EngageBot API down.
const mongoose = require('mongoose');

const emotionConn = mongoose.createConnection();

if (!process.env.EMOTION_MONGO_URI) {
  console.warn('EMOTION_MONGO_URI not set — research ingestion is disabled');
} else {
  emotionConn.openUri(process.env.EMOTION_MONGO_URI, {
    dbName: 'Emotion_Data',
    autoIndex: false,     // never create or change indexes in his database
    autoCreate: false,    // never create collections in his database
    bufferCommands: false, // fail fast instead of queueing writes while disconnected
  })
    .then(() => console.log('Emotion_Data connected'))
    .catch(err => console.error('Emotion_Data connection failed:', err.message));
}

emotionConn.isReady = () => emotionConn.readyState === 1;

module.exports = emotionConn;

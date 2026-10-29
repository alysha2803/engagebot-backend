// Separate connection to EngageBot's research database on Zhang's cluster (EngageBot_Emotion).
// Collections mirror Zhang's Emotion_Data format so the two projects can be merged later,
// but EngageBot never writes to Emotion_Data itself.
// Kept apart from the main EngageBot connection so research data never mixes with app data,
// and so an outage on his cluster does not take the EngageBot API down.
const mongoose = require('mongoose');

const dbName = process.env.EMOTION_DB_NAME || 'EngageBot_Emotion';

const emotionConn = mongoose.createConnection();

if (!process.env.EMOTION_MONGO_URI) {
  console.warn('EMOTION_MONGO_URI not set — research ingestion is disabled');
} else {
  emotionConn.openUri(process.env.EMOTION_MONGO_URI, {
    dbName,
    autoIndex: false,     // never create or change indexes on his cluster
    autoCreate: false,    // collections are created on first insert only
    bufferCommands: false, // fail fast instead of queueing writes while disconnected
  })
    .then(() => console.log(`${dbName} connected`))
    .catch(err => console.error(`${dbName} connection failed:`, err.message));
}

emotionConn.isReady = () => emotionConn.readyState === 1;

module.exports = emotionConn;

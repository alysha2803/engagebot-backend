const Counter = require('../models/Counter');

// Atomic running number. IDs stay unique under concurrent creates and are never reused after a delete.
// readCurrentMax seeds a new counter from the highest ID already in use.
async function nextSequence(key, readCurrentMax) {
  if (!(await Counter.exists({ _id: key }))) {
    const seq = await readCurrentMax();
    try {
      await Counter.create({ _id: key, seq });
    } catch (err) {
      if (err.code !== 11000) throw err; // another request created it first
    }
  }
  const counter = await Counter.findByIdAndUpdate(key, { $inc: { seq: 1 } }, { new: true }).lean();
  return counter.seq;
}

module.exports = nextSequence;

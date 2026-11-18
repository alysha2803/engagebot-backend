const crypto = require('crypto');

function isValidDroidKey(provided) {
  const expected = process.env.DROID_API_KEY;
  if (!expected || typeof provided !== 'string') return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Checks the X-Droid-Key header against DROID_API_KEY.
// TESTING PHASE: if DROID_API_KEY is not set, requests are allowed through with a warning.
// Set DROID_API_KEY in .env to turn enforcement on — no code change needed.
// With NODE_ENV=production a missing key always rejects the request.
function verifyDroid(req, res, next) {
  if (!process.env.DROID_API_KEY && process.env.NODE_ENV !== 'production') return next();

  if (!isValidDroidKey(req.headers['x-droid-key'])) {
    return res.status(401).json({ message: 'Invalid or missing droid key' });
  }
  req.droid = true;
  next();
}

if (!process.env.DROID_API_KEY) {
  console.warn('DROID_API_KEY not set — droid endpoints are UNAUTHENTICATED (testing only)');
}

module.exports = { verifyDroid, isValidDroidKey };

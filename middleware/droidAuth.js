const crypto = require('crypto');

// Checks the X-Droid-Key header against DROID_API_KEY.
// TESTING PHASE: if DROID_API_KEY is not set, requests are allowed through with a warning.
// Set DROID_API_KEY in .env to turn enforcement on — no code change needed.
function verifyDroid(req, res, next) {
  const expected = process.env.DROID_API_KEY;
  if (!expected) return next();

  const provided = req.headers['x-droid-key'] || '';
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ message: 'Invalid or missing droid key' });
  }
  next();
}

if (!process.env.DROID_API_KEY) {
  console.warn('DROID_API_KEY not set — /api/emotion ingestion is UNAUTHENTICATED (testing only)');
}

module.exports = { verifyDroid };

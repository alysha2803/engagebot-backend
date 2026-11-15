// Turns a caught error into an API response without exposing database internals.
const CLIENT_ERRORS = ['ValidationError', 'CastError', 'StrictModeError'];

function sendError(res, err) {
  if (CLIENT_ERRORS.includes(err.name)) return res.status(400).json({ message: err.message });
  if (err.code === 11000) return res.status(409).json({ message: 'A record with this value already exists' });
  console.error(err);
  res.status(500).json({ message: 'Internal server error' });
}

module.exports = sendError;

// Shared cap/append logic for face embedding arrays -- used when growing a
// Student's or a PendingFace's reference set over time (continual
// enrollment), not just replacing it outright. Used in 3 places (append to
// a student directly, grow a pending face, merge a labeled pending face's
// embeddings into its student), so it's factored out once rather than
// duplicated.

const MAX_EMBEDDINGS_PER_IDENTITY = 20;

// Appends `incoming` vectors to `existing`, dropping the OLDEST vectors
// first if the combined total exceeds the cap -- keeps the most recent
// sightings rather than letting the array grow unbounded.
function appendEmbeddings(existing, incoming, max = MAX_EMBEDDINGS_PER_IDENTITY) {
  const combined = [...(existing || []), ...incoming];
  return combined.length > max ? combined.slice(combined.length - max) : combined;
}

module.exports = { MAX_EMBEDDINGS_PER_IDENTITY, appendEmbeddings };

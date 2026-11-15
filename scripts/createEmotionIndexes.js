// Creates the unique segment_id indexes in the EngageBot research database, so a droid resending
// a segment gets a 409 instead of a duplicate. Safe to re-run:
//   npm run create-emotion-indexes

require('dotenv').config();
require('../db/dns');
const emotionConn = require('../db/emotion');
const models = require('../models/emotion');

async function main() {
  await emotionConn.asPromise();
  for (const [name, Model] of Object.entries(models)) {
    await Model.createIndexes();
    console.log(`Indexes ready: ${name} (${Model.collection.name})`);
  }
  process.exit(0);
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});

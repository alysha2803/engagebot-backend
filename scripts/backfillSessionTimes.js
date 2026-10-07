// Run once to fill startedAt / endedAt on session reports created before those fields existed:
//   node scripts/backfillSessionTimes.js
// Safe to re-run: only touches reports where startedAt or endedAt is missing.

require('dotenv').config();
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);
const mongoose = require('mongoose');
const SessionReport = require('../models/SessionReport');

async function main() {
  await mongoose.connect(process.env.MONGO_URI);

  const reports = await SessionReport.find({
    $or: [{ startedAt: { $exists: false } }, { endedAt: { $exists: false } }],
  }).lean();

  let updated = 0;
  const skipped = [];
  for (const r of reports) {
    const startedAt = SessionReport.toTimestamp(r.date, r.startTime);
    const endedAt = SessionReport.toTimestamp(r.date, r.endTime);
    if (!startedAt && !endedAt) {
      skipped.push(`${r._id} (date="${r.date}", startTime="${r.startTime}", endTime="${r.endTime}")`);
      continue;
    }
    await SessionReport.updateOne({ _id: r._id }, { $set: { startedAt, endedAt } });
    updated++;
  }

  console.log(`Checked ${reports.length} reports, updated ${updated}.`);
  if (skipped.length) console.log(`Skipped ${skipped.length} with unparseable date/time:\n  ${skipped.join('\n  ')}`);
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

// Sets the school on every admin and teacher account. For the current single-school setup:
// run once for existing accounts, or again to correct the name.
//   npm run set-school -- "SMK Bandar Kinrara 4"
// New teachers get their school from the admin who registers them.

require('dotenv').config();
require('../db/dns');
const mongoose = require('mongoose');
const Admin = require('../models/Admin');
const Teacher = require('../models/Teacher');

async function main() {
  const school = (process.argv[2] || '').trim();
  if (!school) {
    console.error('Usage: npm run set-school -- "School name"');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  const admins = await Admin.updateMany({}, { school });
  const teachers = await Teacher.updateMany({}, { school });
  console.log(`School set to "${school}" on ${admins.modifiedCount} admin(s) and ${teachers.modifiedCount} teacher(s).`);
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

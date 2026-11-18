// Run once to create the first admin account:
//   node scripts/createAdmin.js
// Set MONGO_URI, ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME (and optionally ADMIN_SCHOOL) as env vars or in .env

require('dotenv').config();
require('../db/dns');
const mongoose = require('mongoose');
const Admin = require('../models/Admin');

async function main() {
  await mongoose.connect(process.env.MONGO_URI);

  const email = (process.env.ADMIN_EMAIL || '').trim();
  const password = (process.env.ADMIN_PASSWORD || '').trim();
  const displayName = (process.env.ADMIN_NAME || 'Admin').trim();
  const role = process.env.ADMIN_ROLE || 'super_admin';
  const school = (process.env.ADMIN_SCHOOL || '').trim();

  if (!email || !password) {
    console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD in your .env file');
    process.exit(1);
  }

  const existing = await Admin.findOne({ email: email.toLowerCase() });
  if (existing) {
    console.log(`Admin ${email} already exists (role: ${existing.role})`);
    process.exit(0);
  }

  const admin = await Admin.create({ email: email.toLowerCase(), password, displayName, role, school });
  console.log(`Admin created: ${admin.email} (role: ${admin.role}, school: ${admin.school || 'not set'})`);
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

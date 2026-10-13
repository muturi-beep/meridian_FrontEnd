// check-user-org.js — verify a specific user's org linkage
require("dotenv").config();
const mongoose = require("mongoose");
const User = require("./backend/models/User");
const Organization = require("./backend/models/Organization");

(async () => {
  await mongoose.connect(process.env.MONGO_URI);

  // Change this to whatever email is failing
  const email = "dm@gmail.com";

  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) {
    console.log(`No user with email "${email}"`);
    await mongoose.disconnect();
    return;
  }

  console.log("─── User ─────────────────────────────");
  console.log("  email:         ", user.email);
  console.log("  role:          ", user.role);
  console.log("  organization:  ", user.organization);
  console.log("  typeof org:    ", typeof user.organization);
  console.log("  org.toString():", String(user.organization));

  console.log("\n─── Attempting Organization.findById ─");
  const org = await Organization.findById(user.organization);
  if (org) {
    console.log("  ✅ Found:", org.name);
  } else {
    console.log("  ❌ NOT FOUND — this is the bug");
    console.log("  → Dumping all organizations:");
    const all = await Organization.find({});
    all.forEach((o) => console.log(`     ${o._id}  ${o.name}`));
  }

  await mongoose.disconnect();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

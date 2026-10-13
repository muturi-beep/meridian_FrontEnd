// check-db-state.js — READ ONLY. Reports what's in the DB right now.
require("dotenv").config();
const mongoose = require("mongoose");

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;

  const cols = await db.listCollections().toArray();
  console.log("\n─── Current DB state ───────────────────────");
  console.log(`Database: ${db.databaseName}\n`);

  for (const info of cols) {
    const count = await db.collection(info.name).countDocuments();
    console.log(`  ${info.name.padEnd(24)} ${String(count).padStart(6)} docs`);
  }

  console.log("\n─── Organizations ──────────────────────────");
  const orgs = await db.collection("organizations").find({}).toArray();
  orgs.forEach((o) => console.log(`  ${o._id}  ${o.name}`));

  console.log("\n─── Users (first 5) ────────────────────────");
  const users = await db.collection("users").find({}).limit(5).toArray();
  users.forEach((u) =>
    console.log(
      `  ${u.email.padEnd(30)} org=${u.organization}  role=${u.role}`,
    ),
  );

  await mongoose.disconnect();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

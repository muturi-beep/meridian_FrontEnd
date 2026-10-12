// backup-db.js
// Dump every collection in the MongoDB database to a timestamped folder.
// Usage:  node backup-db.js
// Output: backups/YYYY-MM-DD-HHMMSS/<collection>.json
//         backups/YYYY-MM-DD-HHMMSS/manifest.json

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const { EJSON } = require("bson");

async function main() {
  if (!process.env.MONGO_URI) {
    console.error("MONGO_URI not set. Aborting.");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to MongoDB.");

  const db = mongoose.connection.db;
  const collections = await db.listCollections().toArray();

  // Build a timestamp like 2026-10-09-1430-22
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;

  const dir = path.join("backups", stamp);
  fs.mkdirSync(dir, { recursive: true });

  const manifest = {
    exportedAt: now.toISOString(),
    database: db.databaseName,
    collections: {},
  };

  let totalDocs = 0;

  for (const info of collections) {
    const name = info.name;
    const docs = await db.collection(name).find({}).toArray();

    // Some Mongo types (ObjectId, Date) need explicit serialization
    // Use EJSON to preserve BSON types (ObjectId, Date, Decimal128, etc.)
    // Plain JSON.stringify would silently convert them all to strings.
    const ejson = EJSON.stringify(docs, { relaxed: false });

    fs.writeFileSync(path.join(dir, `${name}.json`), ejson);

    manifest.collections[name] = docs.length;
    totalDocs += docs.length;

    console.log(`  ${name.padEnd(24)} ${String(docs.length).padStart(5)} docs`);
  }

  fs.writeFileSync(
    path.join(dir, "manifest.json"),
    JSON.stringify(manifest, null, 2),
  );

  console.log(`\n✅ Backup complete: ${dir}`);
  console.log(
    `   ${collections.length} collections, ${totalDocs} total documents\n`,
  );

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

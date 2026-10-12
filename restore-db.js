// restore-db.js
// Restore every collection from a backup folder.
// WARNING: Wipes the current database first.
// Usage:  node restore-db.js              (lists backups, prompts)
//         node restore-db.js backups/...  (restores a specific folder)

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const readline = require("readline");
const mongoose = require("mongoose");
const { EJSON } = require("bson");

async function ask(q) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((res) =>
    rl.question(q, (ans) => {
      rl.close();
      res(ans ?? "");
    }),
  );
}

async function main() {
  if (!process.env.MONGO_URI) {
    console.error("MONGO_URI not set. Aborting.");
    process.exit(1);
  }

  const backupsRoot = "backups";
  if (!fs.existsSync(backupsRoot)) {
    console.error("No backups/ folder found. Run backup-db.js first.");
    process.exit(1);
  }

  const folders = fs
    .readdirSync(backupsRoot)
    .filter((f) => fs.statSync(path.join(backupsRoot, f)).isDirectory())
    .sort();

  if (!folders.length) {
    console.error("No backup folders found.");
    process.exit(1);
  }

  let target = process.argv[2];
  if (!target) {
    console.log("\nAvailable backups:");
    folders.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
    const choice = (
      await ask("\nEnter folder name (or number, or blank for newest): ")
    ).trim();

    if (!choice) {
      target = folders[folders.length - 1];
      console.log(`  (no input - using newest: ${target})`);
    } else if (folders.includes(choice)) {
      target = choice;
    } else {
      const idx = parseInt(choice, 10);
      if (Number.isNaN(idx) || idx < 1 || idx > folders.length) {
        console.error(`\n❌ Invalid selection: "${choice}"`);
        console.error(
          `   Enter a number between 1 and ${folders.length}, or a folder name.\n`,
        );
        process.exit(1);
      }
      target = folders[idx - 1];
    }
  }

  const dir = path.join(backupsRoot, target);
  if (!fs.existsSync(dir)) {
    console.error(`Backup folder not found: ${dir}`);
    process.exit(1);
  }

  const manifest = JSON.parse(
    fs.readFileSync(path.join(dir, "manifest.json"), "utf8"),
  );

  // Format check: refuse to load backups that would corrupt ObjectId types.
  // New backups set manifest.format = "ejson". Old backups don't have it.
  if (manifest.format && manifest.format !== "ejson") {
    console.error(`\n❌ Backup format "${manifest.format}" is not supported.`);
    console.error('   Only "ejson" backups can be restored safely.\n');
    process.exit(1);
  }

  if (!manifest.format) {
    console.log("\n⚠️  This backup has no format marker.");
    console.log("   It was likely made before the EJSON fix.");
    console.log("   If it was, restoring will corrupt ObjectId types.");
    console.log(
      '   Check by opening any .json file — safe backups contain {"$oid":"..."}',
    );
    const ok = await ask("   Continue anyway? (type YES): ");
    if (ok.trim() !== "YES") {
      console.log("Cancelled.\n");
      process.exit(0);
    }
  }

  console.log("\n─── About to restore ───────────────────────");
  console.log(`  Folder:     ${dir}`);
  console.log(`  Format:     ${manifest.format || "(unknown)"}`);
  console.log(`  Exported:   ${manifest.exportedAt}`);
  console.log(`  Database:   ${manifest.database}`);
  console.log("  Collections:");
  Object.entries(manifest.collections).forEach(([name, count]) => {
    console.log(`    ${name.padEnd(24)} ${String(count).padStart(5)} docs`);
  });
  console.log(
    "\n⚠️  This will WIPE the current database and replace it with the backup.",
  );
  console.log(
    "    Everything written since the backup was taken will be lost.\n",
  );

  const confirm = await ask("Type YES to confirm: ");
  if (confirm.trim() !== "YES") {
    console.log("Cancelled.");
    process.exit(0);
  }

  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;

  // Wipe every collection currently in the DB
  const currentCols = await db.listCollections().toArray();
  for (const info of currentCols) {
    await db.collection(info.name).deleteMany({});
  }

  // Reload from backup (EJSON parses ObjectIds and Dates back to real types)
  for (const [name] of Object.entries(manifest.collections)) {
    const file = path.join(dir, `${name}.json`);
    if (!fs.existsSync(file)) continue;

    const raw = fs.readFileSync(file, "utf8");
    const docs = EJSON.parse(raw);
    if (!docs.length) continue;

    await db.collection(name).insertMany(docs);
    console.log(
      `  restored ${name.padEnd(24)} ${String(docs.length).padStart(5)} docs`,
    );
  }

  console.log("\n✅ Restore complete.\n");
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

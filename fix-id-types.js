// fix-id-types.js
// Repairs documents whose ID fields were stored as strings by the backup restore.
// Dry-run (default): reports what needs fixing.
// Apply: node fix-id-types.js --apply

require("dotenv").config();
const mongoose = require("mongoose");
const { ObjectId } = mongoose.Types;

const APPLY = process.argv.includes("--apply");

// Fields that should be ObjectIds, per collection
const OBJECTID_FIELDS = {
  users: ["_id", "organization"],
  products: ["_id", "organization", "propertyId", "tenantId"],
  properties: ["_id", "organization"],
  organizations: ["_id"],
  payments: ["_id", "organization", "tenantId"],
  maintenances: ["_id", "organization", "requestedById", "assignedToId"],
  // counters._id is a compound string key, not an ObjectId - skip
};

function isObjectIdString(v) {
  return typeof v === "string" && /^[0-9a-fA-F]{24}$/.test(v);
}

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;

  console.log(
    `\nMode: ${APPLY ? "⚠️  APPLY — will write changes" : "🔍 DRY RUN — read only"}\n`,
  );
  console.log("Collection        Total   Need fix");
  console.log("─".repeat(40));

  let totalDocs = 0;
  let totalFixes = 0;

  for (const [collName, fields] of Object.entries(OBJECTID_FIELDS)) {
    const col = db.collection(collName);
    const docs = await col.find({}).toArray();
    let fixes = 0;

    for (const doc of docs) {
      const changes = {};
      for (const f of fields) {
        if (isObjectIdString(doc[f])) {
          changes[f] = new ObjectId(doc[f]);
        }
      }
      if (!Object.keys(changes).length) continue;

      fixes++;
      totalFixes++;

      if (APPLY) {
        try {
          if (changes._id) {
            // _id is immutable — delete and re-insert with the new ObjectId
            const newDoc = { ...doc, ...changes };
            await col.deleteOne({ _id: doc._id });
            await col.insertOne(newDoc);
          } else {
            await col.updateOne({ _id: doc._id }, { $set: changes });
          }
        } catch (e) {
          console.error(`  ✗ ${collName} ${doc._id}: ${e.message}`);
          fixes--;
          totalFixes--;
        }
      }
    }

    totalDocs += docs.length;
    console.log(
      `${collName.padEnd(16)} ${String(docs.length).padStart(5)}   ${String(fixes).padStart(6)}`,
    );
  }

  console.log("─".repeat(40));
  console.log(
    `TOTAL            ${String(totalDocs).padStart(5)}   ${String(totalFixes).padStart(6)}`,
  );
  console.log("");

  if (!APPLY) {
    console.log("Dry run only. To apply the fix, run:");
    console.log("  node fix-id-types.js --apply\n");
  } else {
    console.log("✅ Applied.\n");
  }

  await mongoose.disconnect();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

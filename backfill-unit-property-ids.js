// backfill-unit-property-ids.js
// One-time migration: for every Unit that has no propertyId, look up the
// Property by name (same organization) and set propertyId.
// Safe to run more than once — already-linked units are skipped.
//
// Run with:  node backfill-unit-property-ids.js
// Delete after use.

require("dotenv").config();
const mongoose = require("mongoose");

const Unit = require("./backend/models/Unit");
const Property = require("./backend/models/Property");

async function main() {
  if (!process.env.MONGO_URI) {
    console.error("MONGO_URI not set. Aborting.");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to MongoDB.");

  const query = {
    $or: [{ propertyId: null }, { propertyId: { $exists: false } }],
  };

  const units = await Unit.find(query);
  console.log(`Found ${units.length} unit(s) needing backfill.\n`);

  let linked = 0;
  let skippedEmpty = 0;
  let orphaned = 0;
  const orphans = [];

  for (const u of units) {
    const propName = (u.property || "").trim();
    if (!propName) {
      skippedEmpty++;
      continue;
    }

    const prop = await Property.findOne({
      organization: u.organization,
      name: propName,
    });
    if (prop) {
      u.propertyId = prop._id;
      await u.save();
      linked++;
    } else {
      orphaned++;
      orphans.push({ name: u.name, property: propName, org: u.organization });
    }
  }

  console.log("─── Summary ───────────────────────────────");
  console.log(`  ✅ ${linked} unit(s) linked to a Property`);
  console.log(`  ⚪  ${skippedEmpty} unit(s) had no property string (skipped)`);
  console.log(
    `  ⚠️  ${orphaned} unit(s) reference a property that doesn't exist`,
  );

  if (orphans.length) {
    console.log(
      '\n  Orphaned units (their "property" string matches no Property record):',
    );
    orphans.forEach((o) => console.log(`    - ${o.name}  →  "${o.property}"`));
    console.log(
      '\n  These units will appear under "Unassigned Units" in the dashboard.',
    );
    console.log(
      "  Fix them by editing each unit and picking a real property from the dropdown.",
    );
  }

  await mongoose.disconnect();
  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});

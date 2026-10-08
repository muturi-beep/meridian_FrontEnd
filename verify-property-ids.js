// verify-property-ids.js — read-only check
require("dotenv").config();
const mongoose = require("mongoose");
const Unit = require("./backend/models/Unit");

(async () => {
  await mongoose.connect(process.env.MONGO_URI);

  const total = await Unit.countDocuments();
  const withId = await Unit.countDocuments({ propertyId: { $ne: null } });
  const missing = await Unit.countDocuments({
    $or: [{ propertyId: null }, { propertyId: { $exists: false } }],
  });

  console.log("Total units:    ", total);
  console.log("With propertyId:", withId);
  console.log("Missing:        ", missing);

  await mongoose.disconnect();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

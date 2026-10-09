// backend/utils/receiptNumber.js
// Generate the next receipt number for an org. Atomic — safe under concurrency.
const Counter = require("../models/Counter");

async function nextReceiptNumber(organizationId) {
  const year = new Date().getFullYear();
  const key = `${organizationId}-${year}`;

  const counter = await Counter.findOneAndUpdate(
    { _id: key },
    { $inc: { seq: 1 } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  return `RCP-${year}-${String(counter.seq).padStart(4, "0")}`;
}

module.exports = { nextReceiptNumber };

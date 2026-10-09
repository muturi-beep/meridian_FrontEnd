// backend/models/Counter.js
// Atomic counters for per-org sequential IDs (receipts, invoices, etc.)
const mongoose = require("mongoose");

const counterSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true }, // e.g. "6ac6085bd7fb5c3049a3c531-2026"
    seq: { type: Number, default: 0 },
  },
  { versionKey: false },
);

module.exports = mongoose.model("Counter", counterSchema);

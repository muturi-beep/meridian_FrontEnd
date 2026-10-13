// backend/models/Subscription.js
// One record per subscription attempt / active plan for an Organization.
// Kept as a history so we can see renewals, upgrades, and expired attempts.
const mongoose = require("mongoose");

const subscriptionSchema = new mongoose.Schema({
  organization: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Organization",
    required: true,
    index: true,
  },

  // Which plan this subscription is for
  plan: {
    type: String,
    enum: ["free", "basic", "professional", "enterprise"],
    required: true,
  },

  // Amount in KES that must be paid (0 for free)
  amount: { type: Number, default: 0 },

  // Lifecycle state
  // - pending: STK push sent, waiting for callback
  // - trial:   free plan currently active
  // - active:  paid plan currently active
  // - expired: past expiresAt
  // - failed:  STK push failed / cancelled
  status: {
    type: String,
    enum: ["pending", "trial", "active", "expired", "failed"],
    default: "pending",
    index: true,
  },

  // When the subscription starts (set when payment confirmed, or immediately for free)
  startsAt: { type: Date, default: null },

  // When the subscription ends
  expiresAt: { type: Date, default: null, index: true },

  // M-Pesa tracking (only used for paid plans)
  mpesaCheckoutRequestId: { type: String, default: "", index: true },
  mpesaReceiptNumber: { type: String, default: "" },
  mpesaResultDesc: { type: String, default: "" },

  // Free-text for future use (e.g. "renewal", "upgrade", "initial")
  note: { type: String, default: "" },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Keep updatedAt fresh
subscriptionSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model("Subscription", subscriptionSchema);

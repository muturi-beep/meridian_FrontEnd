const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema({
  organization: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Organization",
    required: true,
    index: true,
  },
  receiptNumber: { type: String, default: "", index: true },
  tenant: { type: String, required: true },
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null,
  },
  // ... rest unchanged
});

module.exports = mongoose.model("Payment", paymentSchema);

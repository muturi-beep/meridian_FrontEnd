const mongoose = require("mongoose");

const unitSchema = new mongoose.Schema({
  organization: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Organization",
    required: true,
    index: true,
  },
  propertyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Property",
    default: null,
    index: true,
  },
  name: { type: String, required: true },
  price: { type: Number, required: true },
  property: { type: String, default: "" },
  tenant: { type: String, default: "—" },
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null,
  },
  floor: { type: String, default: "—" },
  status: { type: String, default: "Vacant" },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Product", unitSchema);

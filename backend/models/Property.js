const mongoose = require('mongoose');

const propertySchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  name:         { type: String, required: true, trim: true },
  type:         { type: String, default: 'Apartment' },
  location:     { type: String, default: '' },
  address:      { type: String, default: '' },
  description:  { type: String, default: '' },
  contactName:  { type: String, default: '' },
  contactPhone: { type: String, default: '' },
  status:       { type: String, default: 'Active' },
  createdAt:    { type: Date,   default: Date.now },
  updatedAt:    { type: Date,   default: Date.now },
});

module.exports = mongoose.model('Property', propertySchema);
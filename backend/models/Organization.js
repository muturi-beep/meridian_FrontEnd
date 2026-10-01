const mongoose = require('mongoose');

const organizationSchema = new mongoose.Schema({
  name:       { type: String, required: true, trim: true },
  slug:       { type: String, required: true, unique: true, lowercase: true, trim: true },
  inviteCode: { type: String, required: true, unique: true },
  type:       { type: String, default: '' },
  email:      { type: String, default: '' },
  phone:      { type: String, default: '' },
  location:   { type: String, default: '' },
  address:    { type: String, default: '' },
  createdAt:  { type: Date,   default: Date.now },
});

module.exports = mongoose.model('Organization', organizationSchema);
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  firstName: { type: String, required: true },
  lastName:  { type: String, required: true },
  email:     { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone:     { type: String, default: '' },
  role:      { type: String, required: true },
  password:  { type: String, required: true },
  avatar:    { type: String, default: '' },
  rent:      { type: Number, default: null },
  deposit:   { type: Number, default: null },
  createdAt: { type: Date,   default: Date.now },
});

module.exports = mongoose.model('User', userSchema);
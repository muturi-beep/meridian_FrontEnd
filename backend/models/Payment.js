const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  tenant:    { type: String, required: true },
  tenantId:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  property:  { type: String, default: '' },
  unit:      { type: String, default: '' },
  amount:    { type: Number, required: true },
  type:      { type: String, default: 'Rent' },
  status:    { type: String, default: 'Paid' },
  method:    { type: String, default: 'M-Pesa' },
  date:      { type: Date,   default: Date.now },
  reference: { type: String, default: '' },
  createdAt: { type: Date,   default: Date.now },
});

module.exports = mongoose.model('Payment', paymentSchema);
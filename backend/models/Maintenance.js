const mongoose = require('mongoose');

const maintenanceSchema = new mongoose.Schema({
  organization:    { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  requestedById:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  requestedByName: { type: String, default: '' },
  title:           { type: String, required: true },
  category:        { type: String, default: '' },
  property:        { type: String, default: '' },
  unit:            { type: String, default: '' },
  priority:        { type: String, default: 'Medium' },
  status:          { type: String, default: 'Open' },
  assignedTo:      { type: String, default: '' },
  assignedToId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  description:     { type: String, default: '' },
  createdAt:       { type: Date,   default: Date.now },
});

module.exports = mongoose.model('Maintenance', maintenanceSchema);
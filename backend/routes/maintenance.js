// backend/routes/maintenance.js
const express = require('express');

const User = require('../models/User');
const Unit = require('../models/Unit');
const Maintenance = require('../models/Maintenance');
const { requireAuth, requireRole, orgScope } = require('../middleware/auth');
const { MAINT_WRITE } = require('../utils/roles');

const router = express.Router();

router.get(['/maintenance', '/api/maintenance'], requireAuth, async (req, res) => {
  try {
    let query = orgScope(req);
    if (req.user.role === 'tenant') {
      const me = await User.findById(req.user.id);
      if (!me) return res.status(404).json({ message: 'User not found' });
      const unit = await Unit.findOne(orgScope(req, { tenantId: me._id }));
      const orClauses = [{ requestedById: me._id }];
      if (unit) orClauses.push({ property: unit.property, unit: unit.name });
      query = orgScope(req, { $or: orClauses });
    }
    res.json(await Maintenance.find(query).sort({ createdAt: -1 }));
  } catch (err) { res.status(500).json({ message: err.message }); }
});

async function resolveStaffAssignment(req) {
  const { assignedToId } = req.body;
  if (assignedToId === undefined) return {};
  if (!assignedToId) return { assignedToId: null };
  const staffUser = await User.findOne(orgScope(req, { _id: assignedToId }));
  if (!staffUser) { const err = new Error('Selected staff account was not found in your organization.'); err.status = 400; throw err; }
  return { assignedToId: staffUser._id, assignedTo: `${staffUser.firstName} ${staffUser.lastName}`.trim() };
}

router.post(['/maintenance', '/api/maintenance'], requireAuth, async (req, res) => {
  try {
    let propertyName = req.body.property || '';
    let unitName     = req.body.unit     || '';
    let requestedById = null;
    let requestedByName = '';
    let forcedStatus = req.body.status || 'Open';

    if (req.user.role === 'tenant') {
      const me = await User.findById(req.user.id);
      if (!me) return res.status(404).json({ message: 'User not found' });
      requestedById = me._id;
      requestedByName = `${me.firstName} ${me.lastName}`.trim();
      const unit = await Unit.findOne(orgScope(req, { tenantId: me._id }));
      if (!unit) return res.status(400).json({ message: 'You are not currently assigned to a unit. Please contact your property manager.' });
      propertyName = unit.property || '';
      unitName     = unit.name     || '';
      forcedStatus = 'Open';
    }

    const assignment = await resolveStaffAssignment(req);
    const order = new Maintenance({ organization: req.user.organizationId, requestedById, requestedByName, title: req.body.title, category: req.body.category || '', property: propertyName, unit: unitName, priority: req.body.priority || 'Medium', status: forcedStatus, assignedTo: assignment.assignedTo || req.body.assignedTo || '', assignedToId: 'assignedToId' in assignment ? assignment.assignedToId : null, description: req.body.description || '' });
    res.status(201).json(await order.save());
  } catch (err) { res.status(err.status || 500).json({ message: err.message }); }
});

router.put(['/maintenance/:id', '/api/maintenance/:id'], requireAuth, requireRole(...MAINT_WRITE), async (req, res) => {
  try {
    const assignment = await resolveStaffAssignment(req);
    const updateData = { title: req.body.title, category: req.body.category, property: req.body.property, unit: req.body.unit, priority: req.body.priority, status: req.body.status, assignedTo: assignment.assignedTo || req.body.assignedTo, description: req.body.description };
    if ('assignedToId' in assignment) updateData.assignedToId = assignment.assignedToId;

    const updated = await Maintenance.findOneAndUpdate(orgScope(req, { _id: req.params.id }), updateData, { new: true });
    if (!updated) return res.status(404).json({ message: 'Work order not found' });
    res.json(updated);
  } catch (err) { res.status(err.status || 500).json({ message: err.message }); }
});

router.delete(['/maintenance/:id', '/api/maintenance/:id'], requireAuth, requireRole(...MAINT_WRITE), async (req, res) => {
  try {
    const deleted = await Maintenance.findOneAndDelete(orgScope(req, { _id: req.params.id }));
    if (!deleted) return res.status(404).json({ message: 'Work order not found' });
    res.json({ message: '✅ Work order deleted' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
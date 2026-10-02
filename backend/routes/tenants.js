// backend/routes/tenants.js
const express = require('express');
const bcrypt = require('bcryptjs');

const User = require('../models/User');
const Unit = require('../models/Unit');
const Property = require('../models/Property');
const { requireAuth, requireRole, orgScope } = require('../middleware/auth');
const { MANAGEMENT } = require('../utils/roles');

const router = express.Router();

router.get(['/api/tenants', '/tenants'], requireAuth, async (req, res) => {
  try {
    const tenants = await User.find(orgScope(req, { role: 'tenant' })).select('-password').sort({ createdAt: -1 });
    const enriched = await Promise.all(tenants.map(async t => {
      const unit = await Unit.findOne(orgScope(req, { tenantId: t._id }));
      const storedRent    = Number(t.rent);
      const storedDeposit = Number(t.deposit);
      return {
        ...t.toObject(),
        unitName: unit?.name || '',
        property: unit?.property || '',
        rent:    Number.isFinite(storedRent) && storedRent > 0
                   ? storedRent
                   : (unit?.price || 0),
        deposit: Number.isFinite(storedDeposit) && storedDeposit > 0
                   ? storedDeposit
                   : 0,
      };
    }));
    res.json(enriched);
  } catch (err) { res.status(500).json({ message: 'Unable to load tenants.' }); }
});

router.post(['/api/tenants', '/tenants'], requireAuth, requireRole(...MANAGEMENT, 'leasing-agent'), async (req, res) => {
  try {
    const { firstName, lastName, email, phone, password, propertyId, unitId, rent, deposit } = req.body;
    if (!firstName || !lastName || !email || !password) return res.status(400).json({ message: 'First name, last name, email and password are required.' });
    if (password.length < 8) return res.status(400).json({ message: 'Password must be at least 8 characters.' });

    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) return res.status(409).json({ message: 'An account with this email already exists.' });

    let property = null;
    if (propertyId) {
      property = await Property.findOne(orgScope(req, { _id: propertyId }));
      if (!property) return res.status(400).json({ message: 'Selected property was not found.' });
    }

    let unit = null;
    if (unitId) {
      unit = await Unit.findOne(orgScope(req, { _id: unitId }));
      if (!unit) return res.status(400).json({ message: 'Selected unit was not found.' });
      if (property && unit.property && unit.property !== property.name) return res.status(400).json({ message: 'Selected unit does not belong to the chosen property.' });
      if (unit.tenantId) return res.status(409).json({ message: `Unit ${unit.name} is already occupied.` });
    }

    const parsedRent    = Number(rent);
    const parsedDeposit = Number(deposit);
    const rentValue    = Number.isFinite(parsedRent)    && parsedRent    > 0 ? parsedRent    : (unit?.price || null);
    const depositValue = Number.isFinite(parsedDeposit) && parsedDeposit > 0 ? parsedDeposit : null;

    const tenant = new User({
      organization: req.user.organizationId,
      firstName, lastName,
      email: email.toLowerCase().trim(),
      phone: phone || '',
      role: 'tenant',
      password: await bcrypt.hash(password, 10),
      rent:    rentValue,
      deposit: depositValue,
    });
    await tenant.save();

    let assignedUnit = null;
    if (unit) {
      unit.tenantId = tenant._id;
      unit.tenant   = `${firstName} ${lastName}`.trim();
      unit.status   = 'Occupied';
      await unit.save();
      assignedUnit = unit;
    }

    const safe = tenant.toObject(); delete safe.password;
    res.status(201).json({
      message: assignedUnit ? `Tenant added and assigned to unit ${assignedUnit.name}.` : 'Tenant added successfully.',
      tenant: safe,
      unit: assignedUnit,
    });
  } catch (err) { res.status(500).json({ message: 'Unable to add tenant.' }); }
});

module.exports = router;
// backend/routes/organizations.js
const express = require('express');

const User = require('../models/User');
const Organization = require('../models/Organization');
const { requireAuth, requireRole, orgScope } = require('../middleware/auth');
const { MANAGEMENT } = require('../utils/roles');
const { generateInviteCode } = require('../utils/slug');

const router = express.Router();

router.get(['/organizations/me', '/api/organizations/me'], requireAuth, async (req, res) => {
  try {
    const org = await Organization.findById(req.user.organizationId);
    if (!org) return res.status(404).json({ message: 'Organization not found' });
    const memberCount = await User.countDocuments(orgScope(req));
    const payload = { id: org._id, name: org.name, slug: org.slug, memberCount };
    if (MANAGEMENT.includes(req.user.role)) payload.inviteCode = org.inviteCode;
    res.json(payload);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.put(['/organizations/me', '/api/organizations/me'], requireAuth, requireRole(...MANAGEMENT), async (req, res) => {
  try {
    const org = await Organization.findById(req.user.organizationId);
    if (!org) return res.status(404).json({ message: 'Organization not found' });
    if (req.body.name && req.body.name.trim()) org.name = req.body.name.trim();
    if (req.body.regenerateInviteCode) org.inviteCode = generateInviteCode();
    await org.save();
    const memberCount = await User.countDocuments(orgScope(req));
    res.json({ message: '✅ Agency settings updated!', id: org._id, name: org.name, slug: org.slug, inviteCode: org.inviteCode, memberCount });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.get(['/api/organization', '/organization'], requireAuth, async (req, res) => {
  const org = await Organization.findById(req.user.organizationId);
  if (!org) return res.status(404).json({ message: 'Organization not found' });
  const payload = { id: org._id, name: org.name, slug: org.slug, type: org.type, email: org.email, phone: org.phone, location: org.location, address: org.address };
  if (MANAGEMENT.includes(req.user.role)) payload.inviteCode = org.inviteCode;
  res.json(payload);
});

router.put(['/api/organization', '/organization'], requireAuth, requireRole(...MANAGEMENT), async (req, res) => {
  try {
    const org = await Organization.findById(req.user.organizationId);
    if (!org) return res.status(404).json({ message: 'Organization not found' });
    const { name, type, email, phone, location, address } = req.body;
    if (name && name.trim()) org.name = name.trim();
    if (type     !== undefined) org.type     = type;
    if (email    !== undefined) org.email    = email;
    if (phone    !== undefined) org.phone    = phone;
    if (location !== undefined) org.location = location;
    if (address  !== undefined) org.address  = address;
    await org.save();
    res.json({ message: 'Organization settings updated.', organization: { id: org._id, name: org.name, slug: org.slug, type: org.type, email: org.email, phone: org.phone, location: org.location, address: org.address, inviteCode: org.inviteCode } });
  } catch (err) { res.status(500).json({ message: 'Unable to save organization settings.' }); }
});

module.exports = router;
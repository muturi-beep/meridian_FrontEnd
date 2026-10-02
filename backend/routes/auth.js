// backend/routes/auth.js
const express = require('express');
const bcrypt = require('bcryptjs');

const User = require('../models/User');
const Organization = require('../models/Organization');
const { requireAuth, requireRole, orgScope } = require('../middleware/auth');
const { signToken, safeUserWithOrg } = require('../utils/tokens');
const { MANAGEMENT } = require('../utils/roles');
const { generateUniqueSlug, generateInviteCode } = require('../utils/slug');

const router = express.Router();

router.post(['/auth/register', '/api/auth/register'], async (req, res) => {
  try {
    const { firstName, lastName, email, phone, role, password, orgAction, organizationName, inviteCode } = req.body;

    if (!firstName || !lastName || !email || !password) return res.status(400).json({ message: 'All required fields must be filled.' });
    if (password.length < 8) return res.status(400).json({ message: 'Password must be at least 8 characters.' });
    if (orgAction !== 'create' && orgAction !== 'join') return res.status(400).json({ message: 'Please specify whether you are creating or joining an agency.' });

    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) return res.status(409).json({ message: 'An account with this email already exists.' });

    let organization, effectiveRole;

    if (orgAction === 'create') {
      if (!organizationName || !organizationName.trim()) return res.status(400).json({ message: 'Please enter a name for your agency.' });
      const slug = await generateUniqueSlug(organizationName);
      const code = generateInviteCode();
      organization = await new Organization({ name: organizationName.trim(), slug, inviteCode: code }).save();
      effectiveRole = 'agency-director';
    } else {
      if (!inviteCode || !inviteCode.trim()) return res.status(400).json({ message: 'Please enter your agency\'s invite code.' });
      if (!role) return res.status(400).json({ message: 'Please select your role — it is required.' });
      organization = await Organization.findOne({ inviteCode: inviteCode.trim().toUpperCase() });
      if (!organization) return res.status(404).json({ message: 'That invite code doesn\'t match any agency. Double-check it with your team.' });
      effectiveRole = role;
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ organization: organization._id, firstName, lastName, email, phone, role: effectiveRole, password: hashedPassword });
    const saved = await user.save();
    const token = signToken(saved);
    const safeUser = await safeUserWithOrg(saved, organization);

    const orgPayload = {
      id: organization._id,
      name: organization.name,
      ...(MANAGEMENT.includes(effectiveRole) ? { inviteCode: organization.inviteCode } : {}),
    };

    res.status(201).json({
      message: orgAction === 'create'
        ? `✅ Agency "${organization.name}" created! Share invite code ${organization.inviteCode} with your team.`
        : `✅ Account created — welcome to ${organization.name}!`,
      user: safeUser, organization: orgPayload, token,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post(['/auth/login', '/api/auth/login'], async (req, res) => {
  try {
    const { email, password, role } = req.body;
    if (!email || !password || !role) return res.status(400).json({ message: 'Email, password and role are required.' });

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) return res.status(401).json({ message: 'No account found with that email address.' });

    const storedPassword = user.password;
    const isBcryptHash = typeof storedPassword === 'string' && storedPassword.startsWith('$2');
    let passwordMatches = false;

    if (isBcryptHash) passwordMatches = await bcrypt.compare(password, storedPassword);
    else if (storedPassword === password) { passwordMatches = true; user.password = await bcrypt.hash(password, 10); await user.save(); }

    if (!passwordMatches) return res.status(401).json({ message: 'Incorrect password. Please try again.' });
    if (user.role !== role) return res.status(401).json({ message: `This account is registered as "${user.role}", not "${role}".` });

    const organization = await Organization.findById(user.organization);
    if (!organization) return res.status(500).json({ message: 'Your account is not linked to a valid agency. Contact support.' });

    const token = signToken(user);
    const safeUser = await safeUserWithOrg(user, organization);
    const orgPayload = {
      id: organization._id,
      name: organization.name,
      ...(MANAGEMENT.includes(user.role) ? { inviteCode: organization.inviteCode } : {}),
    };

    res.json({ message: '✅ Login successful!', user: safeUser, organization: orgPayload, token });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get(['/auth/users', '/api/auth/users'], requireAuth, requireRole(...MANAGEMENT), async (req, res) => {
  try { res.json(await User.find(orgScope(req)).select('-password').sort({ createdAt: -1 })); }
  catch (err) { res.status(500).json({ message: err.message }); }
});

router.get(['/auth/users/:id', '/api/auth/users/:id'], requireAuth, async (req, res) => {
  try {
    const user = await User.findOne(orgScope(req, { _id: req.params.id })).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.put(['/auth/users/:id', '/api/auth/users/:id'], requireAuth, async (req, res) => {
  try {
    const target = await User.findOne(orgScope(req, { _id: req.params.id }));
    if (!target) return res.status(404).json({ message: 'User not found' });

    const isSelf = req.user.id === req.params.id;
    const isPrivileged = MANAGEMENT.includes(req.user.role);
    if (!isSelf && !isPrivileged) return res.status(403).json({ message: 'You can only update your own profile.' });

    const { firstName, lastName, phone, avatar, password, role } = req.body;
    const updateData = { firstName, lastName, phone, avatar };
    if (role && isPrivileged) updateData.role = role;
    if (password && password.length >= 8) updateData.password = await bcrypt.hash(password, 10);

    const updated = await User.findByIdAndUpdate(req.params.id, updateData, { new: true }).select('-password');
    res.json({ message: '✅ Profile updated!', user: updated });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

router.delete(['/auth/users/:id', '/api/auth/users/:id'], requireAuth, async (req, res) => {
  try {
    const target = await User.findOne(orgScope(req, { _id: req.params.id }));
    if (!target) return res.status(404).json({ message: 'User not found' });

    const isSelf = req.user.id === req.params.id;
    const isPrivileged = MANAGEMENT.includes(req.user.role);
    if (!isSelf && !isPrivileged) return res.status(403).json({ message: 'You do not have permission to delete this account.' });

    await User.findByIdAndDelete(req.params.id);
    res.json({ message: '✅ Account deleted successfully.' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

module.exports = router;
// backend/routes/profile.js
const express = require('express');
const bcrypt = require('bcryptjs');

const User = require('../models/User');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get(['/api/profile', '/profile'], requireAuth, async (req, res) => {
  const me = await User.findById(req.user.id).select('-password');
  if (!me) return res.status(404).json({ message: 'User not found' });
  res.json(me);
});

router.put(['/api/profile', '/profile'], requireAuth, async (req, res) => {
  try {
    const me = await User.findById(req.user.id);
    if (!me) return res.status(404).json({ message: 'User not found' });

    const { firstName, lastName, phone, avatar, currentPassword, newPassword } = req.body;
    if (firstName) me.firstName = firstName;
    if (lastName)  me.lastName  = lastName;
    if (phone     !== undefined) me.phone  = phone;
    if (avatar    !== undefined) me.avatar = avatar;

    if (newPassword) {
      if (newPassword.length < 8) return res.status(400).json({ message: 'New password must be at least 8 characters.' });
      if (!currentPassword) return res.status(400).json({ message: 'Please enter your current password to set a new one.' });
      const ok = await bcrypt.compare(currentPassword, me.password);
      if (!ok) return res.status(400).json({ message: 'Current password is incorrect.' });
      me.password = await bcrypt.hash(newPassword, 10);
    }
    await me.save();
    const safe = me.toObject(); delete safe.password;
    res.json({ message: 'Profile updated successfully.', user: safe });
  } catch (err) { res.status(500).json({ message: 'Unable to update profile. Please try again.' }); }
});

module.exports = router;
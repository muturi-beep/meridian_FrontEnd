const crypto = require('crypto');
const Organization = require('../models/Organization');

async function generateUniqueSlug(name) {
  const base = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'agency';
  let slug = base;
  let attempt = 0;
  while (await Organization.exists({ slug })) {
    attempt += 1;
    slug = `${base}-${crypto.randomBytes(2).toString('hex')}`;
    if (attempt > 10) throw new Error('Could not generate a unique organization slug.');
  }
  return slug;
}

function generateInviteCode() {
  const raw = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

module.exports = { generateUniqueSlug, generateInviteCode };
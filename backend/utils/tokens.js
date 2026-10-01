// backend/utils/tokens.js
// JWT signing/verification + safe user payloads.

const jwt = require('jsonwebtoken');

const JWT_SECRET  = process.env.JWT_SECRET;
const JWT_EXPIRES = '7d';

if (!JWT_SECRET) {
  console.error('❌ JWT_SECRET is not set. Add it in Vercel → Settings → Environment Variables.');
}

function signToken(user) {
  return jwt.sign(
    { id: user._id, role: user.role, email: user.email, organizationId: user.organization },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );
}

async function safeUserWithOrg(userDoc, orgDoc) {
  const { password: _, ...safeUser } = userDoc.toObject();
  safeUser.organizationId   = orgDoc._id;
  safeUser.organizationName = orgDoc.name;
  return safeUser;
}

module.exports = { signToken, safeUserWithOrg, JWT_SECRET, JWT_EXPIRES };
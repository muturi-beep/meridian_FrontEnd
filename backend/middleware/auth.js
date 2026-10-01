// backend/middleware/auth.js
// Request guards: requireAuth, requireRole, orgScope.

const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../utils/tokens');

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'No token provided.' });

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    if (!req.user.organizationId) {
      return res.status(401).json({ message: 'Session out of date — please log in again.' });
    }
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token.' });
  }
}

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: 'You do not have permission to perform this action.' });
    }
    next();
  };
}

function orgScope(req, extra = {}) {
  return { organization: req.user.organizationId, ...extra };
}

module.exports = { requireAuth, requireRole, orgScope };
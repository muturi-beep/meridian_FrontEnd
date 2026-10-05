// backend/middleware/rateLimit.js
// Rate limiters for sensitive auth endpoints.
// Memory-store based — per serverless instance. Fine for now.

const rateLimit = require("express-rate-limit");

// 10 requests per 15 minutes per IP for login + register.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Too many attempts from this IP. Please try again in 15 minutes.",
  },
  // On Vercel, req.ip needs the trust-proxy setting — already set in backend/app.js
});

// Slightly looser limiter for other authenticated actions (future use).
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests. Please slow down." },
});

module.exports = { authLimiter, apiLimiter };

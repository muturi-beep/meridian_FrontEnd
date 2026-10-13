// backend/middleware/subscriptionGuard.js
// Blocks management-role API calls when the org's subscription is not active.
// - Tenants always pass (so rent flow keeps working)
// - Fails open on errors (never locks everyone out over a middleware glitch)
// - Bypasses a fixed list of paths that must always be reachable

const jwt = require("jsonwebtoken");
const Organization = require("../models/Organization");
const { JWT_SECRET } = require("../utils/tokens");

// Paths that are always allowed, regardless of subscription status.
const BYPASS_PREFIXES = [
  "/auth",
  "/api/auth",
  "/health",
  "/api/health",
  "/debug",
  "/api/debug",
  "/api/mpesa/callback", // Safaricom callback - critical
  "/api/mpesa/stkpush", // tenants paying rent
  "/api/subscription/status", // they need to see why they're blocked
  "/api/subscription/start", // and be able to fix it
  "/tenant", // tenant self-service
  "/api/tenant",
];

function shouldBypass(req) {
  const p = req.path || "";
  return BYPASS_PREFIXES.some(
    (prefix) => p === prefix || p.startsWith(prefix + "/"),
  );
}

module.exports = async function subscriptionGuard(req, res, next) {
  try {
    // No token → route's own guard will 401. Nothing for us to do.
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) return next();

    let user;
    try {
      user = jwt.verify(token, JWT_SECRET);
    } catch {
      // Invalid token → route guard will 401. Skip silently.
      return next();
    }

    if (!user || !user.organizationId) return next(); // legacy token
    if (user.role === "tenant") return next(); // tenants always allowed
    if (shouldBypass(req)) return next(); // public / critical paths

    const org = await Organization.findById(user.organizationId)
      .select("subscriptionStatus subscriptionExpiresAt")
      .lean();

    if (!org) return next(); // missing org → let route handle it

    const status = org.subscriptionStatus || "none";
    const expiresAt = org.subscriptionExpiresAt;
    const isActive =
      ["active", "trial"].includes(status) &&
      expiresAt &&
      new Date(expiresAt) > new Date();

    if (!isActive) {
      return res.status(402).json({
        message: "Your subscription is not active. Please renew to continue.",
        code: "SUBSCRIPTION_REQUIRED",
      });
    }

    return next();
  } catch (err) {
    // Fail open - never lock users out due to a middleware bug.
    console.error("[subscriptionGuard] error (failing open):", err.message);
    return next();
  }
};

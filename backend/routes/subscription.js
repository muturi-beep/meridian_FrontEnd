// backend/routes/subscription.js
// Subscription signup, upgrade, and status endpoints.
const express = require("express");

const Organization = require("../models/Organization");
const Subscription = require("../models/Subscription");
const { requireAuth, requireRole } = require("../middleware/auth");
const { initiateSTKPush } = require("../services/mpesa");

const router = express.Router();

// Pricing — must match public/index.html and public/js/auth.js
const PLAN_PRICES = {
  free: 0,
  basic: 2500,
  professional: 5000,
  enterprise: 7500,
};

const TRIAL_DAYS = 30;

function addDays(date, days) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

// ══════════════════════════════════════════════════════
// GET /api/subscription/status
// Returns the current subscription state of the caller's org.
// Lazy-expires if expiresAt has passed.
// ══════════════════════════════════════════════════════
router.get("/api/subscription/status", requireAuth, async (req, res) => {
  try {
    const org = await Organization.findById(req.user.organizationId);
    if (!org)
      return res.status(404).json({ message: "Organization not found" });

    // Lazy expiry
    if (
      org.subscriptionExpiresAt &&
      new Date(org.subscriptionExpiresAt) < new Date() &&
      ["active", "trial"].includes(org.subscriptionStatus)
    ) {
      org.subscriptionStatus = "expired";
      await org.save();

      if (org.currentSubscription) {
        const sub = await Subscription.findById(org.currentSubscription);
        if (sub && ["active", "trial"].includes(sub.status)) {
          sub.status = "expired";
          await sub.save();
        }
      }
    }

    const status = org.subscriptionStatus || "none";
    const expiresAt = org.subscriptionExpiresAt || null;
    const daysLeft = expiresAt
      ? Math.max(
          0,
          Math.ceil((new Date(expiresAt) - new Date()) / (24 * 60 * 60 * 1000)),
        )
      : 0;

    let plan = null;
    if (org.currentSubscription) {
      const sub = await Subscription.findById(org.currentSubscription);
      plan = sub?.plan || null;
    }

    const isActive = ["active", "trial"].includes(status) && daysLeft > 0;

    res.json({ status, plan, expiresAt, daysLeft, isActive });
  } catch (err) {
    console.error("Subscription status error:", err);
    res.status(500).json({ message: "Unable to check subscription." });
  }
});

// ══════════════════════════════════════════════════════
// POST /api/subscription/start
// Body: { plan, phone? }
//   plan = free                             → activates 30-day trial
//   plan = basic|professional|enterprise    → STK push for payment
// Only agency-director can call this.
// ══════════════════════════════════════════════════════
router.post(
  "/api/subscription/start",
  requireAuth,
  requireRole("agency-director"),
  async (req, res) => {
    try {
      const { plan, phone } = req.body;
      if (!Object.prototype.hasOwnProperty.call(PLAN_PRICES, plan)) {
        return res.status(400).json({ message: "Invalid plan." });
      }

      const org = await Organization.findById(req.user.organizationId);
      if (!org)
        return res.status(404).json({ message: "Organization not found." });

      const now = new Date();
      const amount = PLAN_PRICES[plan];

      // ── FREE TRIAL ────────────────────────────────────
      if (plan === "free") {
        const priorTrial = await Subscription.findOne({
          organization: org._id,
          plan: "free",
        });
        if (priorTrial) {
          return res
            .status(409)
            .json({ message: "Your agency has already used its free trial." });
        }

        const expiresAt = addDays(now, TRIAL_DAYS);

        const sub = await new Subscription({
          organization: org._id,
          plan: "free",
          amount: 0,
          status: "trial",
          startsAt: now,
          expiresAt,
          note: "trial activated via paywall",
        }).save();

        org.currentSubscription = sub._id;
        org.subscriptionStatus = "trial";
        org.subscriptionExpiresAt = expiresAt;
        await org.save();

        return res.json({
          message: "Free trial activated. Enjoy 30 days on us!",
          plan: "free",
          expiresAt,
        });
      }

      // ── PAID PLAN ─────────────────────────────────────
      if (!phone) {
        return res
          .status(400)
          .json({ message: "Phone number is required for paid plans." });
      }

      // Create a fresh pending subscription for this attempt
      const sub = await new Subscription({
        organization: org._id,
        plan,
        amount,
        status: "pending",
        note: "awaiting payment via paywall",
      }).save();

      org.currentSubscription = sub._id;
      org.subscriptionStatus = "pending";
      await org.save();

      // Initiate STK push
      const accountRef = `SUB-${String(org._id).slice(-6).toUpperCase()}`;
      const description = `${plan}`;

      let stkResponse;
      try {
        stkResponse = await initiateSTKPush(
          phone,
          amount,
          accountRef,
          description,
        );
      } catch (err) {
        sub.status = "failed";
        sub.mpesaResultDesc = err.message || "STK push failed";
        await sub.save();
        console.error(
          "Subscription STK push failed:",
          err.response?.data || err.message,
        );
        return res
          .status(400)
          .json({
            message: err.message || "Failed to initiate M-Pesa payment.",
          });
      }

      if (stkResponse.ResponseCode !== "0") {
        sub.status = "failed";
        sub.mpesaResultDesc =
          stkResponse.ResponseDescription || "Safaricom rejected";
        await sub.save();
        return res
          .status(400)
          .json({
            message:
              stkResponse.ResponseDescription ||
              "Safaricom rejected the request.",
          });
      }

      sub.mpesaCheckoutRequestId = stkResponse.CheckoutRequestID;
      await sub.save();

      res.json({
        message: "STK Push sent. Check your phone.",
        checkoutRequestId: stkResponse.CheckoutRequestID,
        customerMessage: stkResponse.CustomerMessage,
        plan,
        amount,
      });
    } catch (err) {
      console.error("Subscription start error:", err);
      res.status(500).json({ message: err.message || "Unexpected error." });
    }
  },
);

module.exports = router;

// backend/routes/mpesa.js
// Tenant-initiated STK Push + Safaricom callback handler.
const express = require("express");

const User = require("../models/User");
const Unit = require("../models/Unit");
const Payment = require("../models/Payment");
const { requireAuth, requireRole, orgScope } = require("../middleware/auth");
const { initiateSTKPush } = require("../services/mpesa");
const { nextReceiptNumber } = require("../utils/receiptNumber");

const router = express.Router();
const Subscription = require("../models/Subscription");
const Organization = require("../models/Organization");

// ══════════════════════════════════════════════════════
// POST /api/mpesa/stkpush
// Tenant triggers a payment prompt on their phone.
// ══════════════════════════════════════════════════════
router.post(
  "/api/mpesa/stkpush",
  requireAuth,
  requireRole("tenant"),
  async (req, res) => {
    try {
      const { phone, amount, paymentType } = req.body;
      if (!phone)
        return res.status(400).json({ message: "Phone number is required." });
      if (!amount || Number(amount) <= 0)
        return res
          .status(400)
          .json({ message: "Amount must be greater than zero." });

      // Validate payment type — must be Rent or Deposit
      const type = String(paymentType || "Rent").trim();
      if (!["Rent", "Deposit"].includes(type)) {
        return res
          .status(400)
          .json({ message: "Payment type must be Rent or Deposit." });
      }

      const me = await User.findById(req.user.id);
      if (!me) return res.status(404).json({ message: "User not found." });

      const unit = await Unit.findOne(orgScope(req, { tenantId: me._id }));
      if (!unit)
        return res
          .status(400)
          .json({ message: "You are not assigned to a unit." });

      const tenantName = `${me.firstName} ${me.lastName}`.trim();
      const accountRef = `U-${String(unit._id).slice(-6).toUpperCase()}`;
      const description = "Rent";

      // Create the pending payment BEFORE calling Safaricom so we can
      // match the callback to a real record even if it arrives instantly.
      const pending = new Payment({
        organization: req.user.organizationId,
        tenant: tenantName,
        tenantId: me._id,
        property: unit.property || "",
        unit: unit.name || "",
        amount: Number(amount),
        type: type,
        status: "Pending",
        method: "M-Pesa",
        date: new Date(),
      });
      await pending.save();

      let stkResponse;
      try {
        stkResponse = await initiateSTKPush(
          phone,
          amount,
          accountRef,
          description,
        );
      } catch (err) {
        // Safaricom call failed - clean up the pending record so we don't leave ghosts
        await Payment.findByIdAndDelete(pending._id);
        console.error("STK Push failed:", err.response?.data || err.message);
        return res.status(400).json({
          message: err.message || "Failed to initiate M-Pesa payment.",
        });
      }

      if (stkResponse.ResponseCode !== "0") {
        await Payment.findByIdAndDelete(pending._id);
        return res.status(400).json({
          message:
            stkResponse.ResponseDescription ||
            "Safaricom rejected the request.",
        });
      }

      pending.mpesaCheckoutRequestId = stkResponse.CheckoutRequestID;
      await pending.save();

      res.json({
        message: "STK Push sent. Check your phone.",
        checkoutRequestId: stkResponse.CheckoutRequestID,
        customerMessage: stkResponse.CustomerMessage,
      });
    } catch (err) {
      console.error("STK Push route error:", err);
      res.status(500).json({ message: err.message || "Unexpected error." });
    }
  },
);

// ══════════════════════════════════════════════════════
// POST /api/mpesa/callback/:secret
// Safaricom posts payment results here. NO auth header from them.
// We secure the route using a secret path segment.
// ══════════════════════════════════════════════════════
router.post("/api/mpesa/callback/:secret", async (req, res) => {
  // 1. Verify secret
  if (req.params.secret !== process.env.MPESA_CALLBACK_SECRET) {
    console.warn("⚠️  M-Pesa callback rejected: wrong secret");
    return res.status(403).json({ message: "Forbidden" });
  }

  // 2. Respond immediately — Safaricom retries on slow/failed responses
  res.status(200).json({ ResultCode: 0, ResultDesc: "Accepted" });

  // 3. Process asynchronously
  try {
    const stk = req.body?.Body?.stkCallback;
    if (!stk) {
      console.warn("⚠️  M-Pesa callback has no stkCallback payload");
      return;
    }

    const { CheckoutRequestID, ResultCode, ResultDesc, CallbackMetadata } = stk;

    // ── 1. Try rent payment first ─────────────────────
    const payment = await Payment.findOne({
      mpesaCheckoutRequestId: CheckoutRequestID,
    });
    if (payment) {
      if (payment.status === "Paid") {
        console.log(`↻ Callback ignored — payment ${payment._id} already Paid`);
        return;
      }

      if (Number(ResultCode) === 0) {
        const items = CallbackMetadata?.Item || [];
        const get = (name) => items.find((i) => i.Name === name)?.Value;

        const mpesaReceipt = get("MpesaReceiptNumber") || "";
        const paidAmount = Number(get("Amount")) || payment.amount;

        payment.amount = paidAmount;
        payment.status = "Paid";
        payment.mpesaReceiptNumber = mpesaReceipt;
        payment.reference = mpesaReceipt;
        payment.mpesaResultDesc = ResultDesc || "Success";
        payment.date = new Date();
        payment.receiptNumber = await nextReceiptNumber(payment.organization);
        await payment.save();

        console.log(
          `✅ M-Pesa rent paid: ${mpesaReceipt} — KES ${paidAmount} (${payment._id})`,
        );
      } else {
        payment.status = "Failed";
        payment.mpesaResultDesc = ResultDesc || "Failed";
        await payment.save();
        console.log(`❌ M-Pesa rent failed: ${ResultDesc} (${payment._id})`);
      }
      return;
    }

    // ── 2. Try subscription ───────────────────────────
    const subscription = await Subscription.findOne({
      mpesaCheckoutRequestId: CheckoutRequestID,
    });
    if (subscription) {
      if (subscription.status === "active") {
        console.log(
          `↻ Callback ignored — subscription ${subscription._id} already active`,
        );
        return;
      }

      const org = await Organization.findById(subscription.organization);

      if (Number(ResultCode) === 0) {
        const items = CallbackMetadata?.Item || [];
        const get = (name) => items.find((i) => i.Name === name)?.Value;

        const mpesaReceipt = get("MpesaReceiptNumber") || "";
        const now = new Date();
        const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

        subscription.status = "active";
        subscription.startsAt = now;
        subscription.expiresAt = expiresAt;
        subscription.mpesaReceiptNumber = mpesaReceipt;
        subscription.mpesaResultDesc = ResultDesc || "Success";
        await subscription.save();

        if (org) {
          org.subscriptionStatus = "active";
          org.subscriptionExpiresAt = expiresAt;
          await org.save();
        }

        console.log(
          `✅ Subscription activated: ${subscription.plan} for ${org?.name || subscription.organization} — KES ${subscription.amount}`,
        );
      } else {
        subscription.status = "failed";
        subscription.mpesaResultDesc = ResultDesc || "Failed";
        await subscription.save();

        if (
          org &&
          org.currentSubscription &&
          String(org.currentSubscription) === String(subscription._id)
        ) {
          org.subscriptionStatus = "pending";
          await org.save();
        }

        console.log(
          `❌ Subscription failed: ${ResultDesc} (${subscription._id})`,
        );
      }
      return;
    }

    // ── 3. Neither matched ────────────────────────────
    console.warn(
      `⚠️  No payment or subscription matches CheckoutRequestID ${CheckoutRequestID}`,
    );
  } catch (err) {
    console.error("Callback processing error:", err);
  }
});

module.exports = router;

// backend/routes/payments.js
const express = require("express");

const User = require("../models/User");
const Payment = require("../models/Payment");
const { requireAuth, requireRole, orgScope } = require("../middleware/auth");
const { FINANCE_VIEW, FINANCE_WRITE } = require("../utils/roles");
const { nextReceiptNumber } = require("../utils/receiptNumber");

const router = express.Router();

router.get(["/payments", "/api/payments"], requireAuth, async (req, res) => {
  try {
    let query = orgScope(req);
    if (req.user.role === "tenant") {
      const me = await User.findById(req.user.id);
      if (!me) return res.status(404).json({ message: "User not found" });
      const fullName = `${me.firstName} ${me.lastName}`.trim();
      query = orgScope(req, {
        $or: [{ tenantId: me._id }, { tenantId: null, tenant: fullName }],
      });
    } else if (!FINANCE_VIEW.includes(req.user.role)) {
      return res.status(403).json({
        message: "You do not have permission to view payment records.",
      });
    }
    res.json(await Payment.find(query).sort({ createdAt: -1 }));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post(
  ["/payments", "/api/payments"],
  requireAuth,
  requireRole(...FINANCE_WRITE),
  async (req, res) => {
    try {
      let tenantName = req.body.tenant;
      let tenantId = req.body.tenantId || null;

      if (tenantId) {
        const tenantUser = await User.findOne(orgScope(req, { _id: tenantId }));
        if (!tenantUser)
          return res
            .status(400)
            .json({ message: "Selected tenant account was not found." });
        tenantName = `${tenantUser.firstName} ${tenantUser.lastName}`.trim();
      }
      if (!tenantName)
        return res
          .status(400)
          .json({ message: "A tenant name or tenantId is required." });

      const receiptNumber = await nextReceiptNumber(req.user.organizationId);

      const payment = new Payment({
        organization: req.user.organizationId,
        receiptNumber,
        tenant: tenantName,
        tenantId,
        property: req.body.property || "",
        unit: req.body.unit || "",
        amount: req.body.amount,
        type: req.body.type || "Rent",
        status: req.body.status || "Paid",
        method: req.body.method || "M-Pesa",
        date: req.body.date || new Date(),
        reference: req.body.reference || "",
      });
      res.status(201).json(await payment.save());
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  },
);

router.put(
  ["/payments/:id", "/api/payments/:id"],
  requireAuth,
  requireRole(...FINANCE_WRITE),
  async (req, res) => {
    try {
      let tenantName = req.body.tenant;
      let tenantId = req.body.tenantId;

      if (tenantId) {
        const tenantUser = await User.findOne(orgScope(req, { _id: tenantId }));
        if (!tenantUser)
          return res
            .status(400)
            .json({ message: "Selected tenant account was not found." });
        tenantName = `${tenantUser.firstName} ${tenantUser.lastName}`.trim();
      }

      const updateData = {
        tenant: tenantName,
        property: req.body.property,
        unit: req.body.unit,
        amount: req.body.amount,
        type: req.body.type,
        status: req.body.status,
        method: req.body.method,
        date: req.body.date,
        reference: req.body.reference,
      };
      if (tenantId !== undefined) updateData.tenantId = tenantId;

      const updated = await Payment.findOneAndUpdate(
        orgScope(req, { _id: req.params.id }),
        updateData,
        { new: true },
      );
      if (!updated)
        return res.status(404).json({ message: "Payment not found" });
      res.json(updated);
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  },
);

router.delete(
  ["/payments/:id", "/api/payments/:id"],
  requireAuth,
  requireRole(...FINANCE_WRITE),
  async (req, res) => {
    try {
      const deleted = await Payment.findOneAndDelete(
        orgScope(req, { _id: req.params.id }),
      );
      if (!deleted)
        return res.status(404).json({ message: "Payment not found" });
      res.json({ message: "✅ Payment deleted successfully" });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  },
);

module.exports = router;

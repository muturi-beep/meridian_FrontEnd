// backend/routes/tenant.js
// Tenant self-service routes: summary + receipts for the logged-in tenant only.
const express = require("express");

const User = require("../models/User");
const Unit = require("../models/Unit");
const Payment = require("../models/Payment");
const Maintenance = require("../models/Maintenance");
const { requireAuth, requireRole, orgScope } = require("../middleware/auth");

const router = express.Router();

router.get(
  ["/api/tenant/summary", "/tenant/summary"],
  requireAuth,
  requireRole("tenant"),
  async (req, res) => {
    try {
      const me = await User.findById(req.user.id).select("-password");
      if (!me) return res.status(404).json({ message: "User not found" });

      const fullName = `${me.firstName} ${me.lastName}`.trim();
      const unit = await Unit.findOne(orgScope(req, { tenantId: me._id }));

      if (!unit) {
        return res.json({
          user: me,
          unit: null,
          property: null,
          rent: 0,
          deposit: me.deposit || 0,
          currentMonth: {
            monthLabel: "",
            due: 0,
            paid: 0,
            balance: 0,
            status: "No Unit",
          },
          payments: [],
          maintenance: { open: 0, total: 0 },
          charts: {
            paymentsByMonth: [],
            maintByStatus: {
              Open: 0,
              "In Progress": 0,
              Resolved: 0,
              Closed: 0,
            },
          },
        });
      }

      const payments = await Payment.find(
        orgScope(req, {
          $or: [{ tenantId: me._id }, { tenantId: null, tenant: fullName }],
        }),
      ).sort({ date: -1, createdAt: -1 });

      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

      const thisMonthPaid = payments
        .filter((p) => {
          const d = p.date ? new Date(p.date) : new Date(p.createdAt);
          return (
            d >= monthStart &&
            d < monthEnd &&
            p.status === "Paid" &&
            (p.type === "Rent" || !p.type)
          );
        })
        .reduce((s, p) => s + (p.amount || 0), 0);

      const storedRent = Number(me.rent);
      const due =
        Number.isFinite(storedRent) && storedRent > 0
          ? storedRent
          : Number(unit.price) || 0;
      const balance = Math.max(0, due - thisMonthPaid);
      let status = "Unpaid";
      if (due === 0) status = "No Rent Due";
      else if (thisMonthPaid >= due) status = "Fully Paid";
      else if (thisMonthPaid > 0) status = "Partial";

      const maint = await Maintenance.find(
        orgScope(req, {
          $or: [
            { requestedById: me._id },
            { property: unit.property, unit: unit.name },
          ],
        }),
      );
      const openMaint = maint.filter(
        (m) => m.status === "Open" || m.status === "In Progress",
      ).length;

      const paymentsByMonth = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        paymentsByMonth.push({
          label: d.toLocaleString("en", { month: "short" }),
          year: d.getFullYear(),
          month: d.getMonth(),
          paid: 0,
          pending: 0,
        });
      }
      payments.forEach((p) => {
        const pd = p.date ? new Date(p.date) : new Date(p.createdAt);
        if (!pd) return;
        const m = paymentsByMonth.find(
          (x) => x.year === pd.getFullYear() && x.month === pd.getMonth(),
        );
        if (!m) return;
        if (p.status === "Paid") m.paid += p.amount || 0;
        else if (p.status === "Pending" || p.status === "Overdue")
          m.pending += p.amount || 0;
      });

      const maintByStatus = {
        Open: 0,
        "In Progress": 0,
        Resolved: 0,
        Closed: 0,
      };
      maint.forEach((m) => {
        if (maintByStatus[m.status] !== undefined) maintByStatus[m.status] += 1;
      });

      res.json({
        user: me,
        unit: {
          id: unit._id,
          name: unit.name,
          floor: unit.floor,
          status: unit.status,
        },
        property: unit.property,
        rent: due,
        deposit: Number(me.deposit) || 0,
        currentMonth: {
          monthLabel: now.toLocaleString("en", {
            month: "long",
            year: "numeric",
          }),
          due,
          paid: thisMonthPaid,
          balance,
          status,
        },
        payments,
        maintenance: { open: openMaint, total: maint.length },
        charts: { paymentsByMonth, maintByStatus },
      });
    } catch (err) {
      console.error("Tenant summary error:", err);
      res.status(500).json({ message: "Unable to load your dashboard." });
    }
  },
);

router.get(
  ["/api/tenant/receipts", "/tenant/receipts"],
  requireAuth,
  requireRole("tenant"),
  async (req, res) => {
    try {
      const me = await User.findById(req.user.id);
      if (!me) return res.status(404).json({ message: "User not found" });
      const fullName = `${me.firstName} ${me.lastName}`.trim();
      res.json(
        await Payment.find(
          orgScope(req, {
            status: "Paid",
            $or: [{ tenantId: me._id }, { tenantId: null, tenant: fullName }],
          }),
        ).sort({ date: -1 }),
      );
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  },
);

module.exports = router;

// backend/routes/dashboard.js
const express = require("express");

const Organization = require("../models/Organization");
const User = require("../models/User");
const Property = require("../models/Property");
const Unit = require("../models/Unit");
const Payment = require("../models/Payment");
const Maintenance = require("../models/Maintenance");
const { requireAuth, orgScope } = require("../middleware/auth");
const { MANAGEMENT } = require("../utils/roles");

const router = express.Router();

router.get(["/api/dashboard", "/dashboard"], requireAuth, async (req, res) => {
  try {
    const [org, me, properties, units, payments, maintenance] =
      await Promise.all([
        Organization.findById(req.user.organizationId),
        User.findById(req.user.id).select("-password"),
        Property.find(orgScope(req)),
        Unit.find(orgScope(req)),
        Payment.find(orgScope(req)),
        Maintenance.find(orgScope(req)),
      ]);
    if (!org || !me)
      return res.status(404).json({ message: "Account not found." });

    const totalUnits = units.length;
    const occupiedUnits = units.filter((u) => u.status === "Occupied").length;
    const vacantUnits = units.filter((u) => u.status === "Vacant").length;
    const reservedUnits = units.filter((u) => u.status === "Reserved").length;
    const maintUnits = units.filter((u) => u.status === "Maintenance").length;

    const now = new Date();
    const monthlyRevenue = payments
      .filter(
        (p) =>
          p.status === "Paid" &&
          p.date &&
          new Date(p.date).getMonth() === now.getMonth() &&
          new Date(p.date).getFullYear() === now.getFullYear(),
      )
      .reduce((s, p) => s + (p.amount || 0), 0);
    const pendingRent = payments
      .filter((p) => p.status === "Pending" || p.status === "Overdue")
      .reduce((s, p) => s + (p.amount || 0), 0);
    const openMaintenance = maintenance.filter(
      (m) => m.status === "Open" || m.status === "In Progress",
    ).length;
    const totalTenants = await User.countDocuments(
      orgScope(req, { role: "tenant" }),
    );

    const propertyBreakdown = properties.map((p) => {
      const pUnits = units.filter(
        (u) =>
          String(u.propertyId) === String(p._id) ||
          (!u.propertyId && u.property === p.name),
      );
      return {
        name: p.name,
        units: pUnits.length,
        occupied: pUnits.filter((u) => u.status === "Occupied").length,
        vacant: pUnits.filter((u) => u.status === "Vacant").length,
        monthlyRent: pUnits.reduce((s, u) => s + (u.price || 0), 0),
      };
    });

    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
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
      const m = months.find(
        (x) => x.year === pd.getFullYear() && x.month === pd.getMonth(),
      );
      if (!m) return;
      if (p.status === "Paid") m.paid += p.amount || 0;
      else if (p.status === "Pending" || p.status === "Overdue")
        m.pending += p.amount || 0;
    });

    const paymentStatus = { Paid: 0, Pending: 0, Overdue: 0, Failed: 0 };
    payments.forEach((p) => {
      if (paymentStatus[p.status] !== undefined) paymentStatus[p.status] += 1;
    });

    const maintStatus = { Open: 0, "In Progress": 0, Resolved: 0, Closed: 0 };
    maintenance.forEach((m) => {
      if (maintStatus[m.status] !== undefined) maintStatus[m.status] += 1;
    });

    res.json({
      user: {
        id: me._id,
        firstName: me.firstName,
        lastName: me.lastName,
        email: me.email,
        phone: me.phone,
        role: me.role,
        avatar: me.avatar,
      },
      organization: {
        id: org._id,
        name: org.name,
        type: org.type,
        email: org.email,
        phone: org.phone,
        location: org.location,
        address: org.address,
        inviteCode: MANAGEMENT.includes(req.user.role)
          ? org.inviteCode
          : undefined,
      },
      stats: {
        totalProperties: properties.length,
        totalUnits,
        totalTenants,
        occupiedUnits,
        vacantUnits,
        reservedUnits,
        maintUnits,
        monthlyRevenue,
        pendingRent,
        maintenanceRequests: openMaintenance,
        occupancyRate: totalUnits
          ? Math.round((occupiedUnits / totalUnits) * 1000) / 10
          : 0,
      },
      charts: {
        propertyBreakdown,
        revenueByMonth: months,
        paymentStatus,
        maintStatus,
      },
    });
  } catch (err) {
    console.error("Dashboard error:", err);
    res
      .status(500)
      .json({ message: "Unable to load dashboard data. Please try again." });
  }
});

module.exports = router;

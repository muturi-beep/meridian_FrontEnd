// backend/routes/tenants.js
// Manager routes: list, add, edit, delete tenants.
const express = require("express");
const bcrypt = require("bcryptjs");

const User = require("../models/User");
const Unit = require("../models/Unit");
const Property = require("../models/Property");
const { requireAuth, requireRole, orgScope } = require("../middleware/auth");
const { MANAGEMENT } = require("../utils/roles");

const router = express.Router();

router.get(["/api/tenants", "/tenants"], requireAuth, async (req, res) => {
  try {
    const tenants = await User.find(orgScope(req, { role: "tenant" }))
      .select("-password")
      .sort({ createdAt: -1 });
    const enriched = await Promise.all(
      tenants.map(async (t) => {
        const unit = await Unit.findOne(orgScope(req, { tenantId: t._id }));
        const storedRent = Number(t.rent);
        const storedDeposit = Number(t.deposit);
        return {
          ...t.toObject(),
          unitName: unit?.name || "",
          property: unit?.property || "",
          rent:
            Number.isFinite(storedRent) && storedRent > 0
              ? storedRent
              : unit?.price || 0,
          deposit:
            Number.isFinite(storedDeposit) && storedDeposit > 0
              ? storedDeposit
              : 0,
        };
      }),
    );
    res.json(enriched);
  } catch (err) {
    res.status(500).json({ message: "Unable to load tenants." });
  }
});

router.post(
  ["/api/tenants", "/tenants"],
  requireAuth,
  requireRole(...MANAGEMENT, "leasing-agent"),
  async (req, res) => {
    try {
      const {
        firstName,
        lastName,
        email,
        phone,
        password,
        propertyId,
        unitId,
        rent,
        deposit,
      } = req.body;
      if (!firstName || !lastName || !email || !password)
        return res
          .status(400)
          .json({
            message: "First name, last name, email and password are required.",
          });
      if (password.length < 8)
        return res
          .status(400)
          .json({ message: "Password must be at least 8 characters." });

      const existing = await User.findOne({
        email: email.toLowerCase().trim(),
      });
      if (existing)
        return res
          .status(409)
          .json({ message: "An account with this email already exists." });

      let property = null;
      if (propertyId) {
        property = await Property.findOne(orgScope(req, { _id: propertyId }));
        if (!property)
          return res
            .status(400)
            .json({ message: "Selected property was not found." });
      }

      let unit = null;
      if (unitId) {
        unit = await Unit.findOne(orgScope(req, { _id: unitId }));
        if (!unit)
          return res
            .status(400)
            .json({ message: "Selected unit was not found." });
        if (property && unit.property && unit.property !== property.name)
          return res
            .status(400)
            .json({
              message: "Selected unit does not belong to the chosen property.",
            });
        if (unit.tenantId)
          return res
            .status(409)
            .json({ message: `Unit ${unit.name} is already occupied.` });
      }

      const parsedRent = Number(rent);
      const parsedDeposit = Number(deposit);
      const rentValue =
        Number.isFinite(parsedRent) && parsedRent > 0
          ? parsedRent
          : unit?.price || null;
      const depositValue =
        Number.isFinite(parsedDeposit) && parsedDeposit > 0
          ? parsedDeposit
          : null;

      const tenant = new User({
        organization: req.user.organizationId,
        firstName,
        lastName,
        email: email.toLowerCase().trim(),
        phone: phone || "",
        role: "tenant",
        password: await bcrypt.hash(password, 10),
        rent: rentValue,
        deposit: depositValue,
      });
      await tenant.save();

      let assignedUnit = null;
      if (unit) {
        unit.tenantId = tenant._id;
        unit.tenant = `${firstName} ${lastName}`.trim();
        unit.status = "Occupied";
        await unit.save();
        assignedUnit = unit;
      }

      const safe = tenant.toObject();
      delete safe.password;
      res.status(201).json({
        message: assignedUnit
          ? `Tenant added and assigned to unit ${assignedUnit.name}.`
          : "Tenant added successfully.",
        tenant: safe,
        unit: assignedUnit,
      });
    } catch (err) {
      res.status(500).json({ message: "Unable to add tenant." });
    }
  },
);

// EDIT TENANT
router.put(
  ["/api/tenants/:id", "/tenants/:id"],
  requireAuth,
  requireRole(...MANAGEMENT, "leasing-agent"),
  async (req, res) => {
    try {
      const tenant = await User.findOne(
        orgScope(req, { _id: req.params.id, role: "tenant" }),
      );
      if (!tenant)
        return res.status(404).json({ message: "Tenant not found." });

      const { firstName, lastName, email, phone, rent, deposit, unitId } =
        req.body;

      if (firstName) tenant.firstName = firstName.trim();
      if (lastName) tenant.lastName = lastName.trim();
      if (phone !== undefined) tenant.phone = phone || "";

      if (email && email.toLowerCase().trim() !== tenant.email) {
        const clash = await User.findOne({
          email: email.toLowerCase().trim(),
          _id: { $ne: tenant._id },
        });
        if (clash)
          return res
            .status(409)
            .json({ message: "Another account already uses that email." });
        tenant.email = email.toLowerCase().trim();
      }

      const parsedRent = Number(rent);
      const parsedDeposit = Number(deposit);
      if (Number.isFinite(parsedRent) && parsedRent > 0)
        tenant.rent = parsedRent;
      if (Number.isFinite(parsedDeposit) && parsedDeposit > 0)
        tenant.deposit = parsedDeposit;

      if (unitId !== undefined) {
        const currentUnit = await Unit.findOne(
          orgScope(req, { tenantId: tenant._id }),
        );
        const desiredUnit = unitId
          ? await Unit.findOne(orgScope(req, { _id: unitId }))
          : null;

        const currentUnitId = currentUnit ? String(currentUnit._id) : null;
        const desiredUnitId = desiredUnit ? String(desiredUnit._id) : null;

        if (currentUnitId !== desiredUnitId) {
          if (currentUnit) {
            currentUnit.tenantId = null;
            currentUnit.tenant = "-";
            currentUnit.status = "Vacant";
            await currentUnit.save();
          }

          if (desiredUnit) {
            if (
              desiredUnit.tenantId &&
              String(desiredUnit.tenantId) !== String(tenant._id)
            ) {
              return res
                .status(409)
                .json({
                  message: `Unit ${desiredUnit.name} is already occupied.`,
                });
            }
            desiredUnit.tenantId = tenant._id;
            desiredUnit.tenant =
              `${tenant.firstName} ${tenant.lastName}`.trim();
            desiredUnit.status = "Occupied";
            await desiredUnit.save();
          }
        } else if (currentUnit) {
          currentUnit.tenant = `${tenant.firstName} ${tenant.lastName}`.trim();
          await currentUnit.save();
        }
      } else {
        const u = await Unit.findOne(orgScope(req, { tenantId: tenant._id }));
        if (u) {
          u.tenant = `${tenant.firstName} ${tenant.lastName}`.trim();
          await u.save();
        }
      }

      await tenant.save();
      const safe = tenant.toObject();
      delete safe.password;
      res.json({ message: "Tenant updated.", tenant: safe });
    } catch (err) {
      console.error("Edit tenant error:", err);
      res.status(500).json({ message: "Unable to update tenant." });
    }
  },
);

// DELETE TENANT
router.delete(
  ["/api/tenants/:id", "/tenants/:id"],
  requireAuth,
  requireRole(...MANAGEMENT),
  async (req, res) => {
    try {
      const tenant = await User.findOne(
        orgScope(req, { _id: req.params.id, role: "tenant" }),
      );
      if (!tenant)
        return res.status(404).json({ message: "Tenant not found." });

      const unit = await Unit.findOne(orgScope(req, { tenantId: tenant._id }));
      if (unit) {
        unit.tenantId = null;
        unit.tenant = "-";
        unit.status = "Vacant";
        await unit.save();
      }

      await User.findByIdAndDelete(tenant._id);
      res.json({
        message: `Tenant deleted${unit ? ` and unit ${unit.name} freed` : ""}.`,
      });
    } catch (err) {
      console.error("Delete tenant error:", err);
      res.status(500).json({ message: "Unable to delete tenant." });
    }
  },
);

module.exports = router;

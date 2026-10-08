// backend/routes/properties.js
const express = require("express");

const Property = require("../models/Property");
const Unit = require("../models/Unit");
const { requireAuth, requireRole, orgScope } = require("../middleware/auth");
const { MANAGEMENT } = require("../utils/roles");

const router = express.Router();

router.get(
  ["/api/properties", "/properties"],
  requireAuth,
  async (req, res) => {
    try {
      const props = await Property.find(orgScope(req)).sort({ createdAt: -1 });
      const enriched = await Promise.all(
        props.map(async (p) => {
          const units = await Unit.find(
            orgScope(req, {
              $or: [
                { propertyId: p._id },
                { propertyId: null, property: p.name },
              ],
            }),
          );

          return {
            ...p.toObject(),
            unitCount: units.length,
            occupiedUnits: units.filter((u) => u.status === "Occupied").length,
            vacantUnits: units.filter((u) => u.status === "Vacant").length,
            expectedRent: units.reduce((s, u) => s + (u.price || 0), 0),
          };
        }),
      );
      res.json(enriched);
    } catch (err) {
      res.status(500).json({ message: "Unable to load properties." });
    }
  },
);

router.post(
  ["/api/properties", "/properties"],
  requireAuth,
  requireRole(...MANAGEMENT, "leasing-agent"),
  async (req, res) => {
    try {
      const {
        name,
        type,
        location,
        address,
        description,
        contactName,
        contactPhone,
        status,
        units,
      } = req.body;
      if (!name || !name.trim())
        return res.status(400).json({ message: "Property name is required." });

      const property = new Property({
        organization: req.user.organizationId,
        name: name.trim(),
        type: type || "Apartment",
        location: location || "",
        address: address || "",
        description: description || "",
        contactName: contactName || "",
        contactPhone: contactPhone || "",
        status: status || "Active",
      });
      const saved = await property.save();

      let unitsCreated = 0;
      if (Array.isArray(units) && units.length) {
        const docs = units
          .filter((u) => u && (u.name || u.unitNumber))
          .map((u) => ({
            organization: req.user.organizationId,
            propertyId: saved._id,
            name: String(u.name || u.unitNumber).trim(),
            price: Number(u.price) || 0,
            property: saved.name,
            tenant: "-",
            tenantId: null,
            floor: u.floor || "-",
            status: u.status || "Vacant",
          }));
        if (docs.length) {
          const created = await Unit.insertMany(docs);
          unitsCreated = created.length;
        }
      }

      res.status(201).json({
        message: `Property added${unitsCreated ? ` with ${unitsCreated} unit(s)` : ""}.`,
        property: saved,
        unitsCreated,
      });
    } catch (err) {
      res.status(500).json({ message: "Unable to add property." });
    }
  },
);

router.get(
  ["/api/properties/:id/units", "/properties/:id/units"],
  requireAuth,
  async (req, res) => {
    try {
      const property = await Property.findOne(
        orgScope(req, { _id: req.params.id }),
      );
      if (!property)
        return res.status(404).json({ message: "Property not found." });
      res.json(
        await Unit.find(
          orgScope(req, {
            $or: [
              { propertyId: property._id },
              { propertyId: null, property: property.name },
            ],
          }),
        ).sort({ name: 1 }),
      );
    } catch (err) {
      res.status(500).json({ message: "Unable to load units." });
    }
  },
);

router.post(
  ["/api/properties/:id/units", "/properties/:id/units"],
  requireAuth,
  requireRole(...MANAGEMENT, "leasing-agent"),
  async (req, res) => {
    try {
      const property = await Property.findOne(
        orgScope(req, { _id: req.params.id }),
      );
      if (!property)
        return res.status(404).json({ message: "Property not found." });

      const units = Array.isArray(req.body.units) ? req.body.units : [];
      const docs = units
        .filter((u) => u && (u.name || u.unitNumber))
        .map((u) => ({
          organization: req.user.organizationId,
          propertyId: property._id,
          name: String(u.name || u.unitNumber).trim(),
          price: Number(u.price) || 0,
          property: property.name,
          tenant: "-",
          tenantId: null,
          floor: u.floor || "-",
          status: u.status || "Vacant",
        }));
      if (!docs.length)
        return res.status(400).json({ message: "No valid units provided." });

      const created = await Unit.insertMany(docs);
      res
        .status(201)
        .json({ message: `${created.length} unit(s) added.`, units: created });
    } catch (err) {
      res.status(500).json({ message: "Unable to add units." });
    }
  },
);

router.put(
  ["/api/properties/:id", "/properties/:id"],
  requireAuth,
  requireRole(...MANAGEMENT, "leasing-agent"),
  async (req, res) => {
    try {
      const update = {
        name: req.body.name,
        type: req.body.type,
        location: req.body.location,
        address: req.body.address,
        description: req.body.description,
        contactName: req.body.contactName,
        contactPhone: req.body.contactPhone,
        status: req.body.status,
        updatedAt: new Date(),
      };
      Object.keys(update).forEach(
        (k) => update[k] === undefined && delete update[k],
      );

      const updated = await Property.findOneAndUpdate(
        orgScope(req, { _id: req.params.id }),
        update,
        { new: true },
      );
      if (!updated)
        return res.status(404).json({ message: "Property not found." });
      res.json({ message: "Property updated.", property: updated });
    } catch (err) {
      res.status(500).json({ message: "Unable to update property." });
    }
  },
);

router.delete(
  ["/api/properties/:id", "/properties/:id"],
  requireAuth,
  requireRole(...MANAGEMENT),
  async (req, res) => {
    try {
      const deleted = await Property.findOneAndDelete(
        orgScope(req, { _id: req.params.id }),
      );
      if (!deleted)
        return res.status(404).json({ message: "Property not found." });
      const cascade = await Unit.deleteMany(
        orgScope(req, { property: deleted.name }),
      );
      res.json({
        message: `Property deleted${cascade.deletedCount ? ` (and ${cascade.deletedCount} unit(s))` : ""}.`,
      });
    } catch (err) {
      res.status(500).json({ message: "Unable to delete property." });
    }
  },
);

module.exports = router;

// backend/routes/units.js
const express = require("express");

const User = require("../models/User");
const Unit = require("../models/Unit");
const Property = require("../models/Property");
const { requireAuth, requireRole, orgScope } = require("../middleware/auth");
const { UNIT_WRITE } = require("../utils/roles");

const router = express.Router();

// -- GET /products --
router.get(["/products", "/api/products"], requireAuth, async (req, res) => {
  try {
    if (req.user.role === "tenant") {
      const me = await User.findById(req.user.id);
      if (!me) return res.status(404).json({ message: "User not found" });
      const fullName = `${me.firstName} ${me.lastName}`.trim();
      const units = await Unit.find(orgScope(req)).sort({ createdAt: -1 });
      return res.json(
        units.map((u) => {
          const obj = u.toObject();
          const isMine = obj.tenantId
            ? String(obj.tenantId) === String(me._id)
            : obj.tenant && obj.tenant === fullName;
          if (obj.tenant && obj.tenant !== "-" && !isMine)
            obj.tenant = obj.status === "Vacant" ? "-" : "Occupied";
          return obj;
        }),
      );
    }
    res.json(await Unit.find(orgScope(req)).sort({ createdAt: -1 }));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// -- helper: resolve tenant assignment from body --
async function resolveTenantAssignment(req) {
  const { tenantId } = req.body;
  if (tenantId === undefined) return {};
  if (!tenantId) return { tenantId: null };
  const tenantUser = await User.findOne(orgScope(req, { _id: tenantId }));
  if (!tenantUser) {
    const err = new Error(
      "Selected tenant account was not found in your organization.",
    );
    err.status = 400;
    throw err;
  }
  return {
    tenantId: tenantUser._id,
    tenant: `${tenantUser.firstName} ${tenantUser.lastName}`.trim(),
  };
}

// -- POST /products - create a unit --
router.post(
  ["/products", "/api/products"],
  requireAuth,
  requireRole(...UNIT_WRITE),
  async (req, res) => {
    try {
      const assignment = await resolveTenantAssignment(req);

      // Resolve propertyId from the property name if one was provided
      let propertyId = null;
      const propName = (req.body.property || "").trim();
      if (propName) {
        const prop = await Property.findOne(orgScope(req, { name: propName }));
        if (prop) propertyId = prop._id;
      }

      const unit = new Unit({
        organization: req.user.organizationId,
        propertyId,
        name: req.body.name,
        price: req.body.price,
        property: req.body.property || "",
        tenant: assignment.tenant || req.body.tenant || "-",
        tenantId: "tenantId" in assignment ? assignment.tenantId : null,
        floor: req.body.floor || "-",
        status: req.body.status || "Vacant",
      });
      res.status(201).json(await unit.save());
    } catch (err) {
      res.status(err.status || 500).json({ message: err.message });
    }
  },
);

// -- PUT /products/:id - update a unit --
router.put(
  ["/products/:id", "/api/products/:id"],
  requireAuth,
  requireRole(...UNIT_WRITE),
  async (req, res) => {
    try {
      const assignment = await resolveTenantAssignment(req);
      const updateData = {
        name: req.body.name,
        price: req.body.price,
        property: req.body.property,
        floor: req.body.floor,
      };
      if (req.body.status !== undefined) updateData.status = req.body.status;

      // Re-resolve propertyId if the property name was changed
      if (req.body.property !== undefined) {
        const propName = (req.body.property || "").trim();
        if (propName) {
          const prop = await Property.findOne(
            orgScope(req, { name: propName }),
          );
          updateData.propertyId = prop ? prop._id : null;
        } else {
          updateData.propertyId = null;
        }
      }

      if ("tenantId" in assignment) {
        updateData.tenantId = assignment.tenantId;
        if (assignment.tenantId) {
          updateData.tenant = assignment.tenant;
          if (req.body.status === undefined || req.body.status === "Vacant")
            updateData.status = "Occupied";
        } else {
          updateData.tenant = "-";
          if (req.body.status === undefined || req.body.status === "Occupied")
            updateData.status = "Vacant";
        }
      } else if (req.body.tenant !== undefined)
        updateData.tenant = req.body.tenant;

      Object.keys(updateData).forEach(
        (k) => updateData[k] === undefined && delete updateData[k],
      );

      const updated = await Unit.findOneAndUpdate(
        orgScope(req, { _id: req.params.id }),
        updateData,
        { new: true },
      );
      if (!updated) return res.status(404).json({ message: "Unit not found" });
      res.json(updated);
    } catch (err) {
      res.status(err.status || 500).json({ message: err.message });
    }
  },
);

// -- DELETE /products/:id - delete a unit --
router.delete(
  ["/products/:id", "/api/products/:id"],
  requireAuth,
  requireRole(...UNIT_WRITE),
  async (req, res) => {
    try {
      const deleted = await Unit.findOneAndDelete(
        orgScope(req, { _id: req.params.id }),
      );
      if (!deleted) return res.status(404).json({ message: "Unit not found" });
      res.json({ message: "Unit deleted successfully" });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  },
);

module.exports = router;

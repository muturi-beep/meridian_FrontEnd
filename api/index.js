require('dotenv').config();
const express  = require('express');
const cors     = require('cors');
const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');
const path     = require('path');

const app = express();

app.set('trust proxy', 1);

/* ══════════════════════════════════════════════════════
   CORS
══════════════════════════════════════════════════════ */
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : '*';

app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json({ limit: '2mb' }));

/* ══════════════════════════════════════════════════════
   STATIC FILES — only for local dev.
   On Vercel, files inside /public are served automatically.
══════════════════════════════════════════════════════ */
if (require.main === module) {
  app.use(express.static(path.join(__dirname, '..', 'public')));
}

/* ══════════════════════════════════════════════════════
   MONGODB — cached for serverless
══════════════════════════════════════════════════════ */
const { connectDB } = require('../backend/config/db');

app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    console.error('DB connect error:', err.message);
    return res.status(500).json({ message: 'Database connection failed. Please try again.' });
  }
});

/* ══════════════════════════════════════════════════════
   MODELS  (moved to backend/models/)
══════════════════════════════════════════════════════ */
const Organization = require('../backend/models/Organization');
const Property     = require('../backend/models/Property');
const Unit         = require('../backend/models/Unit');
const User         = require('../backend/models/User');
const Maintenance  = require('../backend/models/Maintenance');
const Payment      = require('../backend/models/Payment');
const { generateUniqueSlug, generateInviteCode } = require('../backend/utils/slug');



/* ══════════════════════════════════════════════════════
   AUTH — moved to backend/middleware + backend/utils
══════════════════════════════════════════════════════ */
const { requireAuth, requireRole, orgScope } = require('../backend/middleware/auth');
const { signToken, safeUserWithOrg }         = require('../backend/utils/tokens');
const { MANAGEMENT, FINANCE_VIEW, FINANCE_WRITE, MAINT_WRITE, UNIT_WRITE } = require('../backend/utils/roles');
const authRoutes          = require('../backend/routes/auth');
const profileRoutes       = require('../backend/routes/profile');
const organizationRoutes  = require('../backend/routes/organizations');
const propertiesRoutes    = require('../backend/routes/properties');
const unitsRoutes         = require('../backend/routes/units');
const tenantsRoutes       = require('../backend/routes/tenants');

/* ══════════════════════════════════════════════════════
   ROUTES  (moved to backend/routes/)
══════════════════════════════════════════════════════ */
app.use(authRoutes);
app.use(profileRoutes);
app.use(organizationRoutes);
app.use(propertiesRoutes);
app.use(unitsRoutes);
app.use(tenantsRoutes);

/* ══════════════════════════════════════════════════════
   DEBUG / HEALTH
══════════════════════════════════════════════════════ */
app.get(['/debug/routes', '/api/debug/routes'], (req, res) => {
  const routes = [];
  const stack = (app._router || app.router)?.stack || [];
  stack.forEach(mw => {
    if (mw.route && mw.route.path) {
      routes.push({
        path: mw.route.path,
        methods: Object.keys(mw.route.methods).map(m => m.toUpperCase()),
      });
    }
  });
  res.json({ count: routes.length, nodeEnv: process.env.NODE_ENV || 'development', mongoState: mongoose.connection.readyState, routes });
});

app.get(['/api/health', '/health'], (req, res) => {
  res.json({ message: '✅ Multi-tenant Properties API running!', ok: true, mongoState: mongoose.connection.readyState });
});

/* ══════════════════════════════════════════════════════
   AUTH ROUTES
══════════════════════════════════════════════════════ */


/* ══════════════════════════════════════════════════════
   ORGANIZATION ROUTES
══════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════
   DASHBOARD
══════════════════════════════════════════════════════ */
app.get(['/api/dashboard', '/dashboard'], requireAuth, async (req, res) => {
  try {
    const [org, me, properties, units, payments, maintenance] = await Promise.all([
      Organization.findById(req.user.organizationId),
      User.findById(req.user.id).select('-password'),
      Property.find(orgScope(req)),
      Unit.find(orgScope(req)),
      Payment.find(orgScope(req)),
      Maintenance.find(orgScope(req)),
    ]);
    if (!org || !me) return res.status(404).json({ message: 'Account not found.' });

    const totalUnits    = units.length;
    const occupiedUnits = units.filter(u => u.status === 'Occupied').length;
    const vacantUnits   = units.filter(u => u.status === 'Vacant').length;
    const reservedUnits = units.filter(u => u.status === 'Reserved').length;
    const maintUnits    = units.filter(u => u.status === 'Maintenance').length;

    const now = new Date();
    const monthlyRevenue = payments.filter(p => p.status === 'Paid' && p.date && new Date(p.date).getMonth() === now.getMonth() && new Date(p.date).getFullYear() === now.getFullYear()).reduce((s, p) => s + (p.amount || 0), 0);
    const pendingRent = payments.filter(p => p.status === 'Pending' || p.status === 'Overdue').reduce((s, p) => s + (p.amount || 0), 0);
    const openMaintenance = maintenance.filter(m => m.status === 'Open' || m.status === 'In Progress').length;

    const propertyBreakdown = properties.map(p => {
      const pUnits = units.filter(u => u.property === p.name);
      return { name: p.name, units: pUnits.length, occupied: pUnits.filter(u => u.status === 'Occupied').length, vacant: pUnits.filter(u => u.status === 'Vacant').length, monthlyRent: pUnits.reduce((s, u) => s + (u.price || 0), 0) };
    });

    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ label: d.toLocaleString('en', { month: 'short' }), year: d.getFullYear(), month: d.getMonth(), paid: 0, pending: 0 });
    }
    payments.forEach(p => {
      const pd = p.date ? new Date(p.date) : new Date(p.createdAt);
      if (!pd) return;
      const m = months.find(x => x.year === pd.getFullYear() && x.month === pd.getMonth());
      if (!m) return;
      if (p.status === 'Paid') m.paid += (p.amount || 0);
      else if (p.status === 'Pending' || p.status === 'Overdue') m.pending += (p.amount || 0);
    });

    const paymentStatus = { Paid: 0, Pending: 0, Overdue: 0, Failed: 0 };
    payments.forEach(p => { if (paymentStatus[p.status] !== undefined) paymentStatus[p.status] += 1; });

    const maintStatus = { Open: 0, 'In Progress': 0, Resolved: 0, Closed: 0 };
    maintenance.forEach(m => { if (maintStatus[m.status] !== undefined) maintStatus[m.status] += 1; });

    res.json({
      user: { id: me._id, firstName: me.firstName, lastName: me.lastName, email: me.email, phone: me.phone, role: me.role, avatar: me.avatar },
      organization: { id: org._id, name: org.name, type: org.type, email: org.email, phone: org.phone, location: org.location, address: org.address, inviteCode: MANAGEMENT.includes(req.user.role) ? org.inviteCode : undefined },
      stats: { totalProperties: properties.length, totalUnits, occupiedUnits, vacantUnits, reservedUnits, maintUnits, monthlyRevenue, pendingRent, maintenanceRequests: openMaintenance, occupancyRate: totalUnits ? Math.round((occupiedUnits / totalUnits) * 1000) / 10 : 0 },
      charts: { propertyBreakdown, revenueByMonth: months, paymentStatus, maintStatus },
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ message: 'Unable to load dashboard data. Please try again.' });
  }
});

/* ══════════════════════════════════════════════════════
   PROFILE
══════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════
   PROPERTIES
══════════════════════════════════════════════════════ */


/* ══════════════════════════════════════════════════════
   TENANTS
══════════════════════════════════════════════════════ */


/* ══════════════════════════════════════════════════════
   UNITS
══════════════════════════════════════════════════════ */


/* ══════════════════════════════════════════════════════
   MAINTENANCE
══════════════════════════════════════════════════════ */
app.get(['/maintenance', '/api/maintenance'], requireAuth, async (req, res) => {
  try {
    let query = orgScope(req);
    if (req.user.role === 'tenant') {
      const me = await User.findById(req.user.id);
      if (!me) return res.status(404).json({ message: 'User not found' });
      const unit = await Unit.findOne(orgScope(req, { tenantId: me._id }));
      const orClauses = [{ requestedById: me._id }];
      if (unit) orClauses.push({ property: unit.property, unit: unit.name });
      query = orgScope(req, { $or: orClauses });
    }
    res.json(await Maintenance.find(query).sort({ createdAt: -1 }));
  } catch (err) { res.status(500).json({ message: err.message }); }
});

async function resolveStaffAssignment(req) {
  const { assignedToId } = req.body;
  if (assignedToId === undefined) return {};
  if (!assignedToId) return { assignedToId: null };
  const staffUser = await User.findOne(orgScope(req, { _id: assignedToId }));
  if (!staffUser) { const err = new Error('Selected staff account was not found in your organization.'); err.status = 400; throw err; }
  return { assignedToId: staffUser._id, assignedTo: `${staffUser.firstName} ${staffUser.lastName}`.trim() };
}

app.post(['/maintenance', '/api/maintenance'], requireAuth, async (req, res) => {
  try {
    let propertyName = req.body.property || '';
    let unitName     = req.body.unit     || '';
    let requestedById = null;
    let requestedByName = '';
    let forcedStatus = req.body.status || 'Open';

    if (req.user.role === 'tenant') {
      const me = await User.findById(req.user.id);
      if (!me) return res.status(404).json({ message: 'User not found' });
      requestedById = me._id;
      requestedByName = `${me.firstName} ${me.lastName}`.trim();
      const unit = await Unit.findOne(orgScope(req, { tenantId: me._id }));
      if (!unit) return res.status(400).json({ message: 'You are not currently assigned to a unit. Please contact your property manager.' });
      propertyName = unit.property || '';
      unitName     = unit.name     || '';
      forcedStatus = 'Open';
    }

    const assignment = await resolveStaffAssignment(req);
    const order = new Maintenance({ organization: req.user.organizationId, requestedById, requestedByName, title: req.body.title, category: req.body.category || '', property: propertyName, unit: unitName, priority: req.body.priority || 'Medium', status: forcedStatus, assignedTo: assignment.assignedTo || req.body.assignedTo || '', assignedToId: 'assignedToId' in assignment ? assignment.assignedToId : null, description: req.body.description || '' });
    res.status(201).json(await order.save());
  } catch (err) { res.status(err.status || 500).json({ message: err.message }); }
});

app.put(['/maintenance/:id', '/api/maintenance/:id'], requireAuth, requireRole(...MAINT_WRITE), async (req, res) => {
  try {
    const assignment = await resolveStaffAssignment(req);
    const updateData = { title: req.body.title, category: req.body.category, property: req.body.property, unit: req.body.unit, priority: req.body.priority, status: req.body.status, assignedTo: assignment.assignedTo || req.body.assignedTo, description: req.body.description };
    if ('assignedToId' in assignment) updateData.assignedToId = assignment.assignedToId;

    const updated = await Maintenance.findOneAndUpdate(orgScope(req, { _id: req.params.id }), updateData, { new: true });
    if (!updated) return res.status(404).json({ message: 'Work order not found' });
    res.json(updated);
  } catch (err) { res.status(err.status || 500).json({ message: err.message }); }
});

app.delete(['/maintenance/:id', '/api/maintenance/:id'], requireAuth, requireRole(...MAINT_WRITE), async (req, res) => {
  try {
    const deleted = await Maintenance.findOneAndDelete(orgScope(req, { _id: req.params.id }));
    if (!deleted) return res.status(404).json({ message: 'Work order not found' });
    res.json({ message: '✅ Work order deleted' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

/* ══════════════════════════════════════════════════════
   TENANT SELF-SERVICE
══════════════════════════════════════════════════════ */
app.get(['/api/tenant/summary', '/tenant/summary'], requireAuth, requireRole('tenant'), async (req, res) => {
  try {
    const me = await User.findById(req.user.id).select('-password');
    if (!me) return res.status(404).json({ message: 'User not found' });

    const fullName = `${me.firstName} ${me.lastName}`.trim();
    const unit = await Unit.findOne(orgScope(req, { tenantId: me._id }));

    if (!unit) {
      return res.json({ user: me, unit: null, property: null, rent: 0, deposit: me.deposit || 0, currentMonth: { monthLabel: '', due: 0, paid: 0, balance: 0, status: 'No Unit' }, payments: [], maintenance: { open: 0, total: 0 }, charts: { paymentsByMonth: [], maintByStatus: { Open: 0, 'In Progress': 0, Resolved: 0, Closed: 0 } } });
    }

    const payments = await Payment.find(orgScope(req, { $or: [{ tenantId: me._id }, { tenantId: null, tenant: fullName }] })).sort({ date: -1, createdAt: -1 });

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const thisMonthPaid = payments.filter(p => { const d = p.date ? new Date(p.date) : new Date(p.createdAt); return d >= monthStart && d < monthEnd && p.status === 'Paid' && (p.type === 'Rent' || !p.type); }).reduce((s, p) => s + (p.amount || 0), 0);

    /* CHANGED: prefer stored tenant rent, fall back to the unit price */
    const storedRent = Number(me.rent);
    const due = Number.isFinite(storedRent) && storedRent > 0 ? storedRent : (Number(unit.price) || 0);
    const balance = Math.max(0, due - thisMonthPaid);
    let status = 'Unpaid';
    if (due === 0) status = 'No Rent Due';
    else if (thisMonthPaid >= due) status = 'Fully Paid';
    else if (thisMonthPaid > 0) status = 'Partial';

    const maint = await Maintenance.find(orgScope(req, { $or: [{ requestedById: me._id }, { property: unit.property, unit: unit.name }] }));
    const openMaint = maint.filter(m => m.status === 'Open' || m.status === 'In Progress').length;

    const paymentsByMonth = [];
    for (let i = 5; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); paymentsByMonth.push({ label: d.toLocaleString('en', { month: 'short' }), year: d.getFullYear(), month: d.getMonth(), paid: 0, pending: 0 }); }
    payments.forEach(p => { const pd = p.date ? new Date(p.date) : new Date(p.createdAt); if (!pd) return; const m = paymentsByMonth.find(x => x.year === pd.getFullYear() && x.month === pd.getMonth()); if (!m) return; if (p.status === 'Paid') m.paid += (p.amount || 0); else if (p.status === 'Pending' || p.status === 'Overdue') m.pending += (p.amount || 0); });

    const maintByStatus = { Open: 0, 'In Progress': 0, Resolved: 0, Closed: 0 };
    maint.forEach(m => { if (maintByStatus[m.status] !== undefined) maintByStatus[m.status] += 1; });

    res.json({
      user: me,
      unit: { id: unit._id, name: unit.name, floor: unit.floor, status: unit.status },
      property: unit.property,
      rent: due,
      deposit: Number(me.deposit) || 0,
      currentMonth: { monthLabel: now.toLocaleString('en', { month: 'long', year: 'numeric' }), due, paid: thisMonthPaid, balance, status },
      payments,
      maintenance: { open: openMaint, total: maint.length },
      charts: { paymentsByMonth, maintByStatus },
    });
  } catch (err) {
    console.error('Tenant summary error:', err);
    res.status(500).json({ message: 'Unable to load your dashboard.' });
  }
});

app.get(['/api/tenant/receipts', '/tenant/receipts'], requireAuth, requireRole('tenant'), async (req, res) => {
  try {
    const me = await User.findById(req.user.id);
    if (!me) return res.status(404).json({ message: 'User not found' });
    const fullName = `${me.firstName} ${me.lastName}`.trim();
    res.json(await Payment.find(orgScope(req, { status: 'Paid', $or: [{ tenantId: me._id }, { tenantId: null, tenant: fullName }] })).sort({ date: -1 }));
  } catch (err) { res.status(500).json({ message: err.message }); }
});

/* ══════════════════════════════════════════════════════
   PAYMENTS
══════════════════════════════════════════════════════ */
app.get(['/payments', '/api/payments'], requireAuth, async (req, res) => {
  try {
    let query = orgScope(req);
    if (req.user.role === 'tenant') {
      const me = await User.findById(req.user.id);
      if (!me) return res.status(404).json({ message: 'User not found' });
      const fullName = `${me.firstName} ${me.lastName}`.trim();
      query = orgScope(req, { $or: [{ tenantId: me._id }, { tenantId: null, tenant: fullName }] });
    } else if (!FINANCE_VIEW.includes(req.user.role)) {
      return res.status(403).json({ message: 'You do not have permission to view payment records.' });
    }
    res.json(await Payment.find(query).sort({ createdAt: -1 }));
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.post(['/payments', '/api/payments'], requireAuth, requireRole(...FINANCE_WRITE), async (req, res) => {
  try {
    let tenantName = req.body.tenant;
    let tenantId = req.body.tenantId || null;

    if (tenantId) {
      const tenantUser = await User.findOne(orgScope(req, { _id: tenantId }));
      if (!tenantUser) return res.status(400).json({ message: 'Selected tenant account was not found.' });
      tenantName = `${tenantUser.firstName} ${tenantUser.lastName}`.trim();
    }
    if (!tenantName) return res.status(400).json({ message: 'A tenant name or tenantId is required.' });

    const payment = new Payment({ organization: req.user.organizationId, tenant: tenantName, tenantId, property: req.body.property || '', unit: req.body.unit || '', amount: req.body.amount, type: req.body.type || 'Rent', status: req.body.status || 'Paid', method: req.body.method || 'M-Pesa', date: req.body.date || new Date(), reference: req.body.reference || '' });
    res.status(201).json(await payment.save());
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.put(['/payments/:id', '/api/payments/:id'], requireAuth, requireRole(...FINANCE_WRITE), async (req, res) => {
  try {
    let tenantName = req.body.tenant;
    let tenantId = req.body.tenantId;

    if (tenantId) {
      const tenantUser = await User.findOne(orgScope(req, { _id: tenantId }));
      if (!tenantUser) return res.status(400).json({ message: 'Selected tenant account was not found.' });
      tenantName = `${tenantUser.firstName} ${tenantUser.lastName}`.trim();
    }

    const updateData = { tenant: tenantName, property: req.body.property, unit: req.body.unit, amount: req.body.amount, type: req.body.type, status: req.body.status, method: req.body.method, date: req.body.date, reference: req.body.reference };
    if (tenantId !== undefined) updateData.tenantId = tenantId;

    const updated = await Payment.findOneAndUpdate(orgScope(req, { _id: req.params.id }), updateData, { new: true });
    if (!updated) return res.status(404).json({ message: 'Payment not found' });
    res.json(updated);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.delete(['/payments/:id', '/api/payments/:id'], requireAuth, requireRole(...FINANCE_WRITE), async (req, res) => {
  try {
    const deleted = await Payment.findOneAndDelete(orgScope(req, { _id: req.params.id }));
    if (!deleted) return res.status(404).json({ message: 'Payment not found' });
    res.json({ message: '✅ Payment deleted successfully' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

/* ══════════════════════════════════════════════════════
   CATCH-ALL 404 (API paths only)
══════════════════════════════════════════════════════ */
app.use((req, res, next) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/auth/') ||
      req.path.startsWith('/products') || req.path.startsWith('/maintenance') ||
      req.path.startsWith('/payments') || req.path.startsWith('/tenants') ||
      req.path.startsWith('/organization') || req.path.startsWith('/profile') ||
      req.path.startsWith('/dashboard') || req.path.startsWith('/debug')) {
    return res.status(404).json({ message: 'Route not found', path: req.path, method: req.method });
  }
  next();
});

/* ══════════════════════════════════════════════════════
   EXPORT FOR VERCEL
══════════════════════════════════════════════════════ */
module.exports = app;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  connectDB()
    .then(() => {
      console.log('✅ Connected to MongoDB');
      app.listen(PORT, () => console.log(`✅ Server running on http://localhost:${PORT}`));
    })
    .catch(err => console.error('❌ MongoDB error:', err.message));
}
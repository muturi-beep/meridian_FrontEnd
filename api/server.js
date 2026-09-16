require('dotenv').config();
const express  = require('express');
const cors     = require('cors');
const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const crypto   = require('crypto');
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

const JWT_SECRET  = process.env.JWT_SECRET;
const JWT_EXPIRES = '7d';

if (!JWT_SECRET) {
  console.error('❌ JWT_SECRET is not set. Add it in Vercel → Settings → Environment Variables.');
}

/* ══════════════════════════════════════════════════════
   MONGODB — cached for serverless
══════════════════════════════════════════════════════ */
let cached = global._mongooseCache;
if (!cached) {
  cached = global._mongooseCache = { conn: null, promise: null };
}

async function connectDB() {
  if (cached.conn && mongoose.connection.readyState === 1) return cached.conn;
  if (!cached.promise) {
    cached.promise = mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      bufferCommands: false,
      maxPoolSize: 10,
    });
  }
  try {
    cached.conn = await cached.promise;
  } catch (err) {
    cached.promise = null;
    throw err;
  }
  return cached.conn;
}

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
   SCHEMAS
══════════════════════════════════════════════════════ */
const organizationSchema = new mongoose.Schema({
  name:       { type: String, required: true, trim: true },
  slug:       { type: String, required: true, unique: true, lowercase: true, trim: true },
  inviteCode: { type: String, required: true, unique: true },
  type:       { type: String, default: '' },
  email:      { type: String, default: '' },
  phone:      { type: String, default: '' },
  location:   { type: String, default: '' },
  address:    { type: String, default: '' },
  createdAt:  { type: Date,   default: Date.now },
});
const Organization = mongoose.model('Organization', organizationSchema);

const propertySchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  name:         { type: String, required: true, trim: true },
  type:         { type: String, default: 'Apartment' },
  location:     { type: String, default: '' },
  address:      { type: String, default: '' },
  description:  { type: String, default: '' },
  contactName:  { type: String, default: '' },
  contactPhone: { type: String, default: '' },
  status:       { type: String, default: 'Active' },
  createdAt:    { type: Date,   default: Date.now },
  updatedAt:    { type: Date,   default: Date.now },
});
const Property = mongoose.model('Property', propertySchema);

async function generateUniqueSlug(name) {
  const base = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'agency';
  let slug = base;
  let attempt = 0;
  while (await Organization.exists({ slug })) {
    attempt += 1;
    slug = `${base}-${crypto.randomBytes(2).toString('hex')}`;
    if (attempt > 10) throw new Error('Could not generate a unique organization slug.');
  }
  return slug;
}

function generateInviteCode() {
  const raw = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

const unitSchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  name:      { type: String, required: true },
  price:     { type: Number, required: true },
  property:  { type: String, default: '' },
  tenant:    { type: String, default: '—' },
  tenantId:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  floor:     { type: String, default: '—' },
  status:    { type: String, default: 'Vacant' },
  createdAt: { type: Date,   default: Date.now },
});
const Unit = mongoose.model('Product', unitSchema);

const userSchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  firstName: { type: String, required: true },
  lastName:  { type: String, required: true },
  email:     { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone:     { type: String, default: '' },
  role:      { type: String, required: true },
  password:  { type: String, required: true },
  avatar:    { type: String, default: '' },
  createdAt: { type: Date,   default: Date.now },
});
const User = mongoose.model('User', userSchema);

const maintenanceSchema = new mongoose.Schema({
  organization:    { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  requestedById:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  requestedByName: { type: String, default: '' },
  title:       { type: String, required: true },
  category:    { type: String, default: '' },
  property:    { type: String, default: '' },
  unit:        { type: String, default: '' },
  priority:    { type: String, default: 'Medium' },
  status:      { type: String, default: 'Open' },
  assignedTo:  { type: String, default: '' },
  assignedToId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  description: { type: String, default: '' },
  createdAt:   { type: Date,   default: Date.now },
});
const Maintenance = mongoose.model('Maintenance', maintenanceSchema);

const paymentSchema = new mongoose.Schema({
  organization: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  tenant:    { type: String, required: true },
  tenantId:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  property:  { type: String, default: '' },
  unit:      { type: String, default: '' },
  amount:    { type: Number, required: true },
  type:      { type: String, default: 'Rent' },
  status:    { type: String, default: 'Paid' },
  method:    { type: String, default: 'M-Pesa' },
  date:      { type: Date,   default: Date.now },
  reference: { type: String, default: '' },
  createdAt: { type: Date,   default: Date.now },
});
const Payment = mongoose.model('Payment', paymentSchema);

/* ══════════════════════════════════════════════════════
   AUTH MIDDLEWARE
══════════════════════════════════════════════════════ */
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'No token provided.' });

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    if (!req.user.organizationId) {
      return res.status(401).json({ message: 'Session out of date — please log in again.' });
    }
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token.' });
  }
}

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: 'You do not have permission to perform this action.' });
    }
    next();
  };
}

function orgScope(req, extra = {}) {
  return { organization: req.user.organizationId, ...extra };
}

const MANAGEMENT    = ['agency-director', 'property-manager'];
const FINANCE_VIEW  = ['agency-director', 'property-manager', 'finance-officer', 'auditor'];
const FINANCE_WRITE = ['agency-director', 'property-manager', 'finance-officer'];
const MAINT_WRITE   = ['agency-director', 'property-manager', 'maintenance-staff'];
const UNIT_WRITE    = ['agency-director', 'property-manager', 'leasing-agent'];

function signToken(user) {
  return jwt.sign(
    { id: user._id, role: user.role, email: user.email, organizationId: user.organization },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );
}

async function safeUserWithOrg(userDoc, orgDoc) {
  const { password: _, ...safeUser } = userDoc.toObject();
  safeUser.organizationId   = orgDoc._id;
  safeUser.organizationName = orgDoc.name;
  return safeUser;
}

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
app.post(['/auth/register', '/api/auth/register'], async (req, res) => {
  try {
    const { firstName, lastName, email, phone, role, password, orgAction, organizationName, inviteCode } = req.body;

    if (!firstName || !lastName || !email || !password) return res.status(400).json({ message: 'All required fields must be filled.' });
    if (password.length < 8) return res.status(400).json({ message: 'Password must be at least 8 characters.' });
    if (orgAction !== 'create' && orgAction !== 'join') return res.status(400).json({ message: 'Please specify whether you are creating or joining an agency.' });

    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) return res.status(409).json({ message: 'An account with this email already exists.' });

    let organization, effectiveRole;

    if (orgAction === 'create') {
      if (!organizationName || !organizationName.trim()) return res.status(400).json({ message: 'Please enter a name for your agency.' });
      const slug = await generateUniqueSlug(organizationName);
      const code = generateInviteCode();
      organization = await new Organization({ name: organizationName.trim(), slug, inviteCode: code }).save();
      effectiveRole = 'agency-director';
    } else {
      if (!inviteCode || !inviteCode.trim()) return res.status(400).json({ message: 'Please enter your agency\'s invite code.' });
      if (!role) return res.status(400).json({ message: 'Please select your role — it is required.' });
      organization = await Organization.findOne({ inviteCode: inviteCode.trim().toUpperCase() });
      if (!organization) return res.status(404).json({ message: 'That invite code doesn\'t match any agency. Double-check it with your team.' });
      effectiveRole = role;
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ organization: organization._id, firstName, lastName, email, phone, role: effectiveRole, password: hashedPassword });
    const saved = await user.save();
    const token = signToken(saved);
    const safeUser = await safeUserWithOrg(saved, organization);

    const orgPayload = {
      id: organization._id,
      name: organization.name,
      ...(MANAGEMENT.includes(effectiveRole) ? { inviteCode: organization.inviteCode } : {}),
    };

    res.status(201).json({
      message: orgAction === 'create'
        ? `✅ Agency "${organization.name}" created! Share invite code ${organization.inviteCode} with your team.`
        : `✅ Account created — welcome to ${organization.name}!`,
      user: safeUser, organization: orgPayload, token,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.post(['/auth/login', '/api/auth/login'], async (req, res) => {
  try {
    const { email, password, role } = req.body;
    if (!email || !password || !role) return res.status(400).json({ message: 'Email, password and role are required.' });

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) return res.status(401).json({ message: 'No account found with that email address.' });

    const storedPassword = user.password;
    const isBcryptHash = typeof storedPassword === 'string' && storedPassword.startsWith('$2');
    let passwordMatches = false;

    if (isBcryptHash) passwordMatches = await bcrypt.compare(password, storedPassword);
    else if (storedPassword === password) { passwordMatches = true; user.password = await bcrypt.hash(password, 10); await user.save(); }

    if (!passwordMatches) return res.status(401).json({ message: 'Incorrect password. Please try again.' });
    if (user.role !== role) return res.status(401).json({ message: `This account is registered as "${user.role}", not "${role}".` });

    const organization = await Organization.findById(user.organization);
    if (!organization) return res.status(500).json({ message: 'Your account is not linked to a valid agency. Contact support.' });

    const token = signToken(user);
    const safeUser = await safeUserWithOrg(user, organization);
    const orgPayload = {
      id: organization._id,
      name: organization.name,
      ...(MANAGEMENT.includes(user.role) ? { inviteCode: organization.inviteCode } : {}),
    };

    res.json({ message: '✅ Login successful!', user: safeUser, organization: orgPayload, token });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.get(['/auth/users', '/api/auth/users'], requireAuth, requireRole(...MANAGEMENT), async (req, res) => {
  try { res.json(await User.find(orgScope(req)).select('-password').sort({ createdAt: -1 })); }
  catch (err) { res.status(500).json({ message: err.message }); }
});

app.get(['/auth/users/:id', '/api/auth/users/:id'], requireAuth, async (req, res) => {
  try {
    const user = await User.findOne(orgScope(req, { _id: req.params.id })).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.put(['/auth/users/:id', '/api/auth/users/:id'], requireAuth, async (req, res) => {
  try {
    const target = await User.findOne(orgScope(req, { _id: req.params.id }));
    if (!target) return res.status(404).json({ message: 'User not found' });

    const isSelf = req.user.id === req.params.id;
    const isPrivileged = MANAGEMENT.includes(req.user.role);
    if (!isSelf && !isPrivileged) return res.status(403).json({ message: 'You can only update your own profile.' });

    const { firstName, lastName, phone, avatar, password, role } = req.body;
    const updateData = { firstName, lastName, phone, avatar };
    if (role && isPrivileged) updateData.role = role;
    if (password && password.length >= 8) updateData.password = await bcrypt.hash(password, 10);

    const updated = await User.findByIdAndUpdate(req.params.id, updateData, { new: true }).select('-password');
    res.json({ message: '✅ Profile updated!', user: updated });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.delete(['/auth/users/:id', '/api/auth/users/:id'], requireAuth, async (req, res) => {
  try {
    const target = await User.findOne(orgScope(req, { _id: req.params.id }));
    if (!target) return res.status(404).json({ message: 'User not found' });

    const isSelf = req.user.id === req.params.id;
    const isPrivileged = MANAGEMENT.includes(req.user.role);
    if (!isSelf && !isPrivileged) return res.status(403).json({ message: 'You do not have permission to delete this account.' });

    await User.findByIdAndDelete(req.params.id);
    res.json({ message: '✅ Account deleted successfully.' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

/* ══════════════════════════════════════════════════════
   ORGANIZATION ROUTES
══════════════════════════════════════════════════════ */
app.get(['/organizations/me', '/api/organizations/me'], requireAuth, async (req, res) => {
  try {
    const org = await Organization.findById(req.user.organizationId);
    if (!org) return res.status(404).json({ message: 'Organization not found' });
    const memberCount = await User.countDocuments(orgScope(req));
    const payload = { id: org._id, name: org.name, slug: org.slug, memberCount };
    if (MANAGEMENT.includes(req.user.role)) payload.inviteCode = org.inviteCode;
    res.json(payload);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.put(['/organizations/me', '/api/organizations/me'], requireAuth, requireRole(...MANAGEMENT), async (req, res) => {
  try {
    const org = await Organization.findById(req.user.organizationId);
    if (!org) return res.status(404).json({ message: 'Organization not found' });
    if (req.body.name && req.body.name.trim()) org.name = req.body.name.trim();
    if (req.body.regenerateInviteCode) org.inviteCode = generateInviteCode();
    await org.save();
    const memberCount = await User.countDocuments(orgScope(req));
    res.json({ message: '✅ Agency settings updated!', id: org._id, name: org.name, slug: org.slug, inviteCode: org.inviteCode, memberCount });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

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
app.get(['/api/profile', '/profile'], requireAuth, async (req, res) => {
  const me = await User.findById(req.user.id).select('-password');
  if (!me) return res.status(404).json({ message: 'User not found' });
  res.json(me);
});

app.put(['/api/profile', '/profile'], requireAuth, async (req, res) => {
  try {
    const me = await User.findById(req.user.id);
    if (!me) return res.status(404).json({ message: 'User not found' });

    const { firstName, lastName, phone, avatar, currentPassword, newPassword } = req.body;
    if (firstName) me.firstName = firstName;
    if (lastName)  me.lastName  = lastName;
    if (phone     !== undefined) me.phone  = phone;
    if (avatar    !== undefined) me.avatar = avatar;

    if (newPassword) {
      if (newPassword.length < 8) return res.status(400).json({ message: 'New password must be at least 8 characters.' });
      if (!currentPassword) return res.status(400).json({ message: 'Please enter your current password to set a new one.' });
      const ok = await bcrypt.compare(currentPassword, me.password);
      if (!ok) return res.status(400).json({ message: 'Current password is incorrect.' });
      me.password = await bcrypt.hash(newPassword, 10);
    }
    await me.save();
    const safe = me.toObject(); delete safe.password;
    res.json({ message: 'Profile updated successfully.', user: safe });
  } catch (err) { res.status(500).json({ message: 'Unable to update profile. Please try again.' }); }
});

/* ══════════════════════════════════════════════════════
   ORGANIZATION SETTINGS
══════════════════════════════════════════════════════ */
app.get(['/api/organization', '/organization'], requireAuth, async (req, res) => {
  const org = await Organization.findById(req.user.organizationId);
  if (!org) return res.status(404).json({ message: 'Organization not found' });
  const payload = { id: org._id, name: org.name, slug: org.slug, type: org.type, email: org.email, phone: org.phone, location: org.location, address: org.address };
  if (MANAGEMENT.includes(req.user.role)) payload.inviteCode = org.inviteCode;
  res.json(payload);
});

app.put(['/api/organization', '/organization'], requireAuth, requireRole(...MANAGEMENT), async (req, res) => {
  try {
    const org = await Organization.findById(req.user.organizationId);
    if (!org) return res.status(404).json({ message: 'Organization not found' });
    const { name, type, email, phone, location, address } = req.body;
    if (name && name.trim()) org.name = name.trim();
    if (type     !== undefined) org.type     = type;
    if (email    !== undefined) org.email    = email;
    if (phone    !== undefined) org.phone    = phone;
    if (location !== undefined) org.location = location;
    if (address  !== undefined) org.address  = address;
    await org.save();
    res.json({ message: 'Organization settings updated.', organization: { id: org._id, name: org.name, slug: org.slug, type: org.type, email: org.email, phone: org.phone, location: org.location, address: org.address, inviteCode: org.inviteCode } });
  } catch (err) { res.status(500).json({ message: 'Unable to save organization settings.' }); }
});

/* ══════════════════════════════════════════════════════
   PROPERTIES
══════════════════════════════════════════════════════ */
app.get(['/api/properties', '/properties'], requireAuth, async (req, res) => {
  try {
    const props = await Property.find(orgScope(req)).sort({ createdAt: -1 });
    const enriched = await Promise.all(props.map(async p => {
      const units = await Unit.find(orgScope(req, { property: p.name }));
      return { ...p.toObject(), unitCount: units.length, occupiedUnits: units.filter(u => u.status === 'Occupied').length, vacantUnits: units.filter(u => u.status === 'Vacant').length, expectedRent: units.reduce((s, u) => s + (u.price || 0), 0) };
    }));
    res.json(enriched);
  } catch (err) { res.status(500).json({ message: 'Unable to load properties.' }); }
});

app.post(['/api/properties', '/properties'], requireAuth, requireRole(...MANAGEMENT, 'leasing-agent'), async (req, res) => {
  try {
    const { name, type, location, address, description, contactName, contactPhone, status, units } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ message: 'Property name is required.' });

    const property = new Property({ organization: req.user.organizationId, name: name.trim(), type: type || 'Apartment', location: location || '', address: address || '', description: description || '', contactName: contactName || '', contactPhone: contactPhone || '', status: status || 'Active' });
    const saved = await property.save();

    let unitsCreated = 0;
    if (Array.isArray(units) && units.length) {
      const docs = units.filter(u => u && (u.name || u.unitNumber)).map(u => ({ organization: req.user.organizationId, name: String(u.name || u.unitNumber).trim(), price: Number(u.price) || 0, property: saved.name, tenant: '—', tenantId: null, floor: u.floor || '—', status: u.status || 'Vacant' }));
      if (docs.length) { const created = await Unit.insertMany(docs); unitsCreated = created.length; }
    }

    res.status(201).json({ message: `Property added${unitsCreated ? ` with ${unitsCreated} unit(s)` : ''}.`, property: saved, unitsCreated });
  } catch (err) { res.status(500).json({ message: 'Unable to add property.' }); }
});

app.get(['/api/properties/:id/units', '/properties/:id/units'], requireAuth, async (req, res) => {
  try {
    const property = await Property.findOne(orgScope(req, { _id: req.params.id }));
    if (!property) return res.status(404).json({ message: 'Property not found.' });
    res.json(await Unit.find(orgScope(req, { property: property.name })).sort({ name: 1 }));
  } catch (err) { res.status(500).json({ message: 'Unable to load units.' }); }
});

app.post(['/api/properties/:id/units', '/properties/:id/units'], requireAuth, requireRole(...MANAGEMENT, 'leasing-agent'), async (req, res) => {
  try {
    const property = await Property.findOne(orgScope(req, { _id: req.params.id }));
    if (!property) return res.status(404).json({ message: 'Property not found.' });

    const units = Array.isArray(req.body.units) ? req.body.units : [];
    const docs = units.filter(u => u && (u.name || u.unitNumber)).map(u => ({ organization: req.user.organizationId, name: String(u.name || u.unitNumber).trim(), price: Number(u.price) || 0, property: property.name, tenant: '—', tenantId: null, floor: u.floor || '—', status: u.status || 'Vacant' }));
    if (!docs.length) return res.status(400).json({ message: 'No valid units provided.' });

    const created = await Unit.insertMany(docs);
    res.status(201).json({ message: `${created.length} unit(s) added.`, units: created });
  } catch (err) { res.status(500).json({ message: 'Unable to add units.' }); }
});

app.put(['/api/properties/:id', '/properties/:id'], requireAuth, requireRole(...MANAGEMENT, 'leasing-agent'), async (req, res) => {
  try {
    const update = { name: req.body.name, type: req.body.type, location: req.body.location, address: req.body.address, description: req.body.description, contactName: req.body.contactName, contactPhone: req.body.contactPhone, status: req.body.status, updatedAt: new Date() };
    Object.keys(update).forEach(k => update[k] === undefined && delete update[k]);

    const updated = await Property.findOneAndUpdate(orgScope(req, { _id: req.params.id }), update, { new: true });
    if (!updated) return res.status(404).json({ message: 'Property not found.' });
    res.json({ message: 'Property updated.', property: updated });
  } catch (err) { res.status(500).json({ message: 'Unable to update property.' }); }
});

app.delete(['/api/properties/:id', '/properties/:id'], requireAuth, requireRole(...MANAGEMENT), async (req, res) => {
  try {
    const deleted = await Property.findOneAndDelete(orgScope(req, { _id: req.params.id }));
    if (!deleted) return res.status(404).json({ message: 'Property not found.' });
    const cascade = await Unit.deleteMany(orgScope(req, { property: deleted.name }));
    res.json({ message: `Property deleted${cascade.deletedCount ? ` (and ${cascade.deletedCount} unit(s))` : ''}.` });
  } catch (err) { res.status(500).json({ message: 'Unable to delete property.' }); }
});

/* ══════════════════════════════════════════════════════
   TENANTS
══════════════════════════════════════════════════════ */
app.get(['/api/tenants', '/tenants'], requireAuth, async (req, res) => {
  try {
    const tenants = await User.find(orgScope(req, { role: 'tenant' })).select('-password').sort({ createdAt: -1 });
    const enriched = await Promise.all(tenants.map(async t => {
      const unit = await Unit.findOne(orgScope(req, { tenantId: t._id }));
      return { ...t.toObject(), unitName: unit?.name || '', property: unit?.property || '', rent: unit?.price || 0 };
    }));
    res.json(enriched);
  } catch (err) { res.status(500).json({ message: 'Unable to load tenants.' }); }
});

app.post(['/api/tenants', '/tenants'], requireAuth, requireRole(...MANAGEMENT, 'leasing-agent'), async (req, res) => {
  try {
    const { firstName, lastName, email, phone, password, propertyId, unitId } = req.body;
    if (!firstName || !lastName || !email || !password) return res.status(400).json({ message: 'First name, last name, email and password are required.' });
    if (password.length < 8) return res.status(400).json({ message: 'Password must be at least 8 characters.' });

    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) return res.status(409).json({ message: 'An account with this email already exists.' });

    let property = null;
    if (propertyId) {
      property = await Property.findOne(orgScope(req, { _id: propertyId }));
      if (!property) return res.status(400).json({ message: 'Selected property was not found.' });
    }

    let unit = null;
    if (unitId) {
      unit = await Unit.findOne(orgScope(req, { _id: unitId }));
      if (!unit) return res.status(400).json({ message: 'Selected unit was not found.' });
      if (property && unit.property && unit.property !== property.name) return res.status(400).json({ message: 'Selected unit does not belong to the chosen property.' });
      if (unit.tenantId) return res.status(409).json({ message: `Unit ${unit.name} is already occupied.` });
    }

    const tenant = new User({ organization: req.user.organizationId, firstName, lastName, email: email.toLowerCase().trim(), phone: phone || '', role: 'tenant', password: await bcrypt.hash(password, 10) });
    await tenant.save();

    let assignedUnit = null;
    if (unit) { unit.tenantId = tenant._id; unit.tenant = `${firstName} ${lastName}`.trim(); unit.status = 'Occupied'; await unit.save(); assignedUnit = unit; }

    const safe = tenant.toObject(); delete safe.password;
    res.status(201).json({ message: assignedUnit ? `Tenant added and assigned to unit ${assignedUnit.name}.` : 'Tenant added successfully.', tenant: safe, unit: assignedUnit });
  } catch (err) { res.status(500).json({ message: 'Unable to add tenant.' }); }
});

/* ══════════════════════════════════════════════════════
   UNITS
══════════════════════════════════════════════════════ */
app.get(['/products', '/api/products'], requireAuth, async (req, res) => {
  try {
    if (req.user.role === 'tenant') {
      const me = await User.findById(req.user.id);
      if (!me) return res.status(404).json({ message: 'User not found' });
      const fullName = `${me.firstName} ${me.lastName}`.trim();
      const units = await Unit.find(orgScope(req)).sort({ createdAt: -1 });
      return res.json(units.map(u => {
        const obj = u.toObject();
        const isMine = obj.tenantId ? String(obj.tenantId) === String(me._id) : (obj.tenant && obj.tenant === fullName);
        if (obj.tenant && obj.tenant !== '—' && !isMine) obj.tenant = obj.status === 'Vacant' ? '—' : 'Occupied';
        return obj;
      }));
    }
    res.json(await Unit.find(orgScope(req)).sort({ createdAt: -1 }));
  } catch (err) { res.status(500).json({ message: err.message }); }
});

async function resolveTenantAssignment(req) {
  const { tenantId } = req.body;
  if (tenantId === undefined) return {};
  if (!tenantId) return { tenantId: null };
  const tenantUser = await User.findOne(orgScope(req, { _id: tenantId }));
  if (!tenantUser) { const err = new Error('Selected tenant account was not found in your organization.'); err.status = 400; throw err; }
  return { tenantId: tenantUser._id, tenant: `${tenantUser.firstName} ${tenantUser.lastName}`.trim() };
}

app.post(['/products', '/api/products'], requireAuth, requireRole(...UNIT_WRITE), async (req, res) => {
  try {
    const assignment = await resolveTenantAssignment(req);
    const unit = new Unit({ organization: req.user.organizationId, name: req.body.name, price: req.body.price, property: req.body.property || '', tenant: assignment.tenant || req.body.tenant || '—', tenantId: 'tenantId' in assignment ? assignment.tenantId : null, floor: req.body.floor || '—', status: req.body.status || 'Vacant' });
    res.status(201).json(await unit.save());
  } catch (err) { res.status(err.status || 500).json({ message: err.message }); }
});

app.put(['/products/:id', '/api/products/:id'], requireAuth, requireRole(...UNIT_WRITE), async (req, res) => {
  try {
    const assignment = await resolveTenantAssignment(req);
    const updateData = { name: req.body.name, price: req.body.price, property: req.body.property, floor: req.body.floor };
    if (req.body.status !== undefined) updateData.status = req.body.status;

    if ('tenantId' in assignment) {
      updateData.tenantId = assignment.tenantId;
      if (assignment.tenantId) {
        updateData.tenant = assignment.tenant;
        if (req.body.status === undefined || req.body.status === 'Vacant') updateData.status = 'Occupied';
      } else {
        updateData.tenant = '—';
        if (req.body.status === undefined || req.body.status === 'Occupied') updateData.status = 'Vacant';
      }
    } else if (req.body.tenant !== undefined) updateData.tenant = req.body.tenant;

    Object.keys(updateData).forEach(k => updateData[k] === undefined && delete updateData[k]);

    const updated = await Unit.findOneAndUpdate(orgScope(req, { _id: req.params.id }), updateData, { new: true });
    if (!updated) return res.status(404).json({ message: 'Unit not found' });
    res.json(updated);
  } catch (err) { res.status(err.status || 500).json({ message: err.message }); }
});

app.delete(['/products/:id', '/api/products/:id'], requireAuth, requireRole(...UNIT_WRITE), async (req, res) => {
  try {
    const deleted = await Unit.findOneAndDelete(orgScope(req, { _id: req.params.id }));
    if (!deleted) return res.status(404).json({ message: 'Unit not found' });
    res.json({ message: '✅ Unit deleted successfully' });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

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
      return res.json({ user: me, unit: null, property: null, rent: 0, currentMonth: { monthLabel: '', due: 0, paid: 0, balance: 0, status: 'No Unit' }, payments: [], maintenance: { open: 0, total: 0 }, charts: { paymentsByMonth: [], maintByStatus: { Open: 0, 'In Progress': 0, Resolved: 0, Closed: 0 } } });
    }

    const payments = await Payment.find(orgScope(req, { $or: [{ tenantId: me._id }, { tenantId: null, tenant: fullName }] })).sort({ date: -1, createdAt: -1 });

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const thisMonthPaid = payments.filter(p => { const d = p.date ? new Date(p.date) : new Date(p.createdAt); return d >= monthStart && d < monthEnd && p.status === 'Paid' && (p.type === 'Rent' || !p.type); }).reduce((s, p) => s + (p.amount || 0), 0);

    const due = Number(unit.price) || 0;
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
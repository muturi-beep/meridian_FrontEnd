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
const dashboardRoutes     = require('../backend/routes/dashboard');
const maintenanceRoutes   = require('../backend/routes/maintenance');
const paymentsRoutes      = require('../backend/routes/payments');
const tenantRoutes        = require('../backend/routes/tenant');

/* ══════════════════════════════════════════════════════
   ROUTES  (moved to backend/routes/)
══════════════════════════════════════════════════════ */
app.use(authRoutes);
app.use(profileRoutes);
app.use(organizationRoutes);
app.use(propertiesRoutes);
app.use(unitsRoutes);
app.use(tenantsRoutes);
app.use(dashboardRoutes);
app.use(maintenanceRoutes);
app.use(paymentsRoutes);
app.use(tenantRoutes);

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


/* ══════════════════════════════════════════════════════
   TENANT SELF-SERVICE
══════════════════════════════════════════════════════ */


/* ══════════════════════════════════════════════════════
   PAYMENTS
══════════════════════════════════════════════════════ */


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
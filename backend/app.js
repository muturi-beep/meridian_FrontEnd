// backend/app.js
// Express app: middleware, DB connect, route wiring, static files, 404.
// Exported as a single `app` — the entry point (api/index.js or a local server) just requires it.

const path     = require('path');
const express  = require('express');
const cors     = require('cors');
const mongoose = require('mongoose');

const { connectDB } = require('./config/db');

// Routes
const authRoutes         = require('./routes/auth');
const profileRoutes      = require('./routes/profile');
const organizationRoutes = require('./routes/organizations');
const propertiesRoutes   = require('./routes/properties');
const unitsRoutes        = require('./routes/units');
const tenantsRoutes      = require('./routes/tenants');
const dashboardRoutes    = require('./routes/dashboard');
const maintenanceRoutes  = require('./routes/maintenance');
const paymentsRoutes     = require('./routes/payments');
const tenantRoutes       = require('./routes/tenant');

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
/* ══════════════════════════════════════════════════════
   STATIC FILES — only useful for local dev.
   On Vercel, files inside /public are served automatically.
══════════════════════════════════════════════════════ */
app.use(express.static(path.join(__dirname, '..', 'public')));

/* ══════════════════════════════════════════════════════
   DB CONNECT MIDDLEWARE
══════════════════════════════════════════════════════ */
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
   ROUTES
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

module.exports = app;
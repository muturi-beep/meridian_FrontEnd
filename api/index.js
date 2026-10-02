// api/index.js
// Vercel serverless entry point. All Express setup lives in backend/app.js.

require('dotenv').config();

const app = require('../backend/app');
const { connectDB } = require('../backend/config/db');

module.exports = app;

// Local dev only — Vercel ignores this block.
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  connectDB()
    .then(() => {
      console.log('✅ Connected to MongoDB');
      app.listen(PORT, () => console.log(`✅ Server running on http://localhost:${PORT}`));
    })
    .catch(err => console.error('❌ MongoDB error:', err.message));
}
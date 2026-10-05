// backend/config/env.js
// Startup environment validation. Fails fast on missing required vars.
// Runs once, at the very top of backend/app.js, before any module that reads env.

const REQUIRED = [
  {
    name: "MONGO_URI",
    hint: "MongoDB connection string — Atlas → Cluster → Connect → Drivers",
  },
  {
    name: "JWT_SECRET",
    hint: "Random 64+ char hex — generate with: node -e \"console.log(require('crypto').randomBytes(64).toString('hex'))\"",
  },
];

function validateEnv() {
  const missing = REQUIRED.filter(({ name }) => {
    const v = process.env[name];
    return !v || !String(v).trim();
  });

  if (missing.length === 0) {
    console.log("✅ Environment variables OK");
    return;
  }

  const lines = [
    "",
    "════════════════════════════════════════════════════════════",
    "❌ Missing required environment variables:",
  ];
  for (const { name, hint } of missing) {
    lines.push("");
    lines.push(`   • ${name}`);
    lines.push(`     ${hint}`);
  }
  lines.push("");
  lines.push("   Where to set them:");
  lines.push("   • Local dev  →  .env file in project root");
  lines.push("   • Production →  Vercel → Settings → Environment Variables");
  lines.push("════════════════════════════════════════════════════════════");
  lines.push("");

  throw new Error(lines.join("\n"));
}

module.exports = { validateEnv };

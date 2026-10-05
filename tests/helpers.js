// tests/helpers.js
// Boots an in-memory MongoDB and returns the Express app wired to it.
// Every test file uses these to get an isolated, real database.

const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

let mongoServer;
let app;

async function setupTestEnv() {
  // Set env BEFORE requiring the app — validateEnv() runs at module load.
  process.env.MONGO_URI = "placeholder-not-used-directly";
  process.env.JWT_SECRET = "test-jwt-secret-for-unit-tests-only";
  process.env.NODE_ENV = "test";

  mongoServer = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongoServer.getUri();

  // Now safe to load the app — its DB middleware will connect lazily.
  app = require("../backend/app");

  // Pre-connect so the first test request isn't slow.
  await mongoose.connect(process.env.MONGO_URI);

  return app;
}

async function teardownTestEnv() {
  try {
    await mongoose.disconnect();
  } catch {}
  if (mongoServer) {
    try {
      await mongoServer.stop();
    } catch {}
  }
}

async function clearDatabase() {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    try {
      await collections[key].deleteMany({});
    } catch {}
  }
}

module.exports = { setupTestEnv, teardownTestEnv, clearDatabase };

// tests/smoke.test.js
// Sanity checks: does the app load? does an HTTP request round-trip?

const request = require("supertest");
const { setupTestEnv, teardownTestEnv, clearDatabase } = require("./helpers");

let app;

beforeAll(async () => {
  app = await setupTestEnv();
}, 60000);
afterAll(teardownTestEnv);
afterEach(clearDatabase);

describe("Smoke", () => {
  it("responds to /api/health", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("returns 404 for an unknown API route", async () => {
    const res = await request(app).get("/api/this-does-not-exist");
    expect(res.status).toBe(404);
  });
});

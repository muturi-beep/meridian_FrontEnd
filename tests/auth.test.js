// tests/auth.test.js
// Covers the critical auth flows: register (create + join), login (all cases).

const request = require("supertest");
const { setupTestEnv, teardownTestEnv, clearDatabase } = require("./helpers");

let app;

beforeAll(async () => {
  app = await setupTestEnv();
}, 60000);
afterAll(teardownTestEnv);
afterEach(clearDatabase);

// Small helper so each test doesn't repeat itself
async function registerAgency(overrides = {}) {
  const payload = {
    firstName: "Alice",
    lastName: "Director",
    email: "alice@example.com",
    password: "password123",
    orgAction: "create",
    organizationName: "Test Agency",
    ...overrides,
  };
  return request(app).post("/auth/register").send(payload);
}

describe("POST /auth/register", () => {
  it("creates a new agency and returns a token + user", async () => {
    const res = await registerAgency();

    expect(res.status).toBe(201);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user).toBeTruthy();
    expect(res.body.user.email).toBe("alice@example.com");
    expect(res.body.user.password).toBeUndefined();
    expect(res.body.user.role).toBe("agency-director");
    expect(res.body.organization.name).toBe("Test Agency");
    expect(res.body.organization.inviteCode).toMatch(
      /^[A-Z0-9]{4}-[A-Z0-9]{4}$/,
    );
  });

  it("rejects duplicate emails", async () => {
    await registerAgency();
    const res = await registerAgency({ organizationName: "Another Agency" });

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/already exists/i);
  });

  it("rejects passwords shorter than 8 characters", async () => {
    const res = await registerAgency({ password: "short" });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/8 characters/i);
  });

  it("lets a new user join an existing agency with the invite code", async () => {
    // Step 1: director creates the agency, gets invite code
    const directorRes = await registerAgency();
    const inviteCode = directorRes.body.organization.inviteCode;

    // Step 2: a tenant joins (tenants are NOT in MANAGEMENT)
    const joinRes = await request(app).post("/auth/register").send({
      firstName: "Tina",
      lastName: "Tenant",
      email: "tina@example.com",
      password: "password123",
      role: "tenant",
      orgAction: "join",
      inviteCode,
    });

    expect(joinRes.status).toBe(201);
    expect(joinRes.body.user.role).toBe("tenant");
    expect(joinRes.body.organization.id).toBe(directorRes.body.organization.id);
    expect(joinRes.body.organization.inviteCode).toBeUndefined();
  });

  it("rejects a bad invite code", async () => {
    const res = await request(app).post("/auth/register").send({
      firstName: "Eve",
      lastName: "Intruder",
      email: "eve@example.com",
      password: "password123",
      role: "tenant",
      orgAction: "join",
      inviteCode: "XXXX-XXXX",
    });

    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/invite code/i);
  });
});

describe("POST /auth/login", () => {
  let email;
  let password;

  beforeEach(async () => {
    email = "login@example.com";
    password = "password123";
    await registerAgency({ email, password });
  });

  it("logs in with correct credentials and role", async () => {
    const res = await request(app).post("/auth/login").send({
      email,
      password,
      role: "agency-director",
    });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.email).toBe(email);
    expect(res.body.user.password).toBeUndefined();
  });

  it("rejects a wrong password", async () => {
    const res = await request(app).post("/auth/login").send({
      email,
      password: "wrong-password",
      role: "agency-director",
    });

    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/password/i);
  });

  it("rejects a wrong role", async () => {
    const res = await request(app).post("/auth/login").send({
      email,
      password,
      role: "tenant",
    });

    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/agency-director/);
  });

  it("rejects an unknown email", async () => {
    const res = await request(app).post("/auth/login").send({
      email: "nobody@example.com",
      password,
      role: "agency-director",
    });

    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/no account/i);
  });

  it("rejects when role is missing", async () => {
    const res = await request(app)
      .post("/auth/login")
      .send({ email, password });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/role/i);
  });
});

describe("GET /api/profile", () => {
  it("requires a token", async () => {
    const res = await request(app).get("/api/profile");
    expect(res.status).toBe(401);
  });

  it("returns the current user for a valid token", async () => {
    const reg = await registerAgency();
    const token = reg.body.token;

    const res = await request(app)
      .get("/api/profile")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.email).toBe("alice@example.com");
    expect(res.body.password).toBeUndefined();
  });
});

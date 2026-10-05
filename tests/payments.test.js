// tests/payments.test.js
// Covers payment CRUD, role permissions, and multi-tenancy on the finance layer.

const request = require("supertest");
const { setupTestEnv, teardownTestEnv, clearDatabase } = require("./helpers");

let app;

beforeAll(async () => {
  app = await setupTestEnv();
}, 60000);
afterAll(teardownTestEnv);
afterEach(clearDatabase);

function auth(token) {
  return { Authorization: `Bearer ${token}` };
}

/**
 * Create an agency + director. Optionally add more users (invite-code join).
 * Returns { director, inviteCode, orgId }.
 */
async function createAgency(suffix) {
  const res = await request(app)
    .post("/auth/register")
    .send({
      firstName: "Director",
      lastName: suffix,
      email: `director-${suffix}@example.com`,
      password: "password123",
      orgAction: "create",
      organizationName: `Agency ${suffix}`,
    });
  return {
    director: { token: res.body.token, user: res.body.user },
    inviteCode: res.body.organization.inviteCode,
    orgId: res.body.organization.id,
  };
}

async function joinAgency(inviteCode, role, suffix) {
  const res = await request(app)
    .post("/auth/register")
    .send({
      firstName: "User",
      lastName: suffix,
      email: `user-${suffix}@example.com`,
      password: "password123",
      role,
      orgAction: "join",
      inviteCode,
    });
  return { token: res.body.token, user: res.body.user };
}

/** Create a tenant + assign to a unit, return { token, tenantId, unitId }. */
async function createTenantWithUnit(directorToken, suffix) {
  // Make a property with one unit
  const propRes = await request(app)
    .post("/api/properties")
    .set(auth(directorToken))
    .send({
      name: `Property ${suffix}`,
      units: [{ name: `U-${suffix}`, price: 25000, status: "Vacant" }],
    });

  const propertyId = propRes.body.property._id;

  // Get the unit id
  const unitsRes = await request(app)
    .get(`/api/properties/${propertyId}/units`)
    .set(auth(directorToken));
  const unitId = unitsRes.body[0]._id;

  // Create the tenant
  const tenantRes = await request(app)
    .post("/api/tenants")
    .set(auth(directorToken))
    .send({
      firstName: "Tenant",
      lastName: suffix,
      email: `tenant-${suffix}@example.com`,
      password: "password123",
      propertyId,
      unitId,
    });

  return {
    tenantId: tenantRes.body.tenant._id,
    tenantEmail: `tenant-${suffix}@example.com`,
    unitId,
  };
}

// ══════════════════════════════════════════════════════════
// Payments CRUD
// ══════════════════════════════════════════════════════════
describe("Payments — CRUD", () => {
  it("director can record a payment and list it", async () => {
    const { director } = await createAgency("a");
    const { tenantId } = await createTenantWithUnit(director.token, "a");

    const createRes = await request(app)
      .post("/payments")
      .set(auth(director.token))
      .send({
        tenantId,
        amount: 25000,
        type: "Rent",
        method: "M-Pesa",
        status: "Paid",
        reference: "MPESA-XYZ123",
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.amount).toBe(25000);
    expect(createRes.body.tenant).toBe("Tenant a");

    const listRes = await request(app)
      .get("/payments")
      .set(auth(director.token));
    expect(listRes.status).toBe(200);
    expect(listRes.body).toHaveLength(1);
    expect(listRes.body[0].reference).toBe("MPESA-XYZ123");
  });

  it("deleting a payment removes it", async () => {
    const { director } = await createAgency("a");
    const { tenantId } = await createTenantWithUnit(director.token, "a");

    const createRes = await request(app)
      .post("/payments")
      .set(auth(director.token))
      .send({ tenantId, amount: 10000, status: "Paid" });

    const paymentId = createRes.body._id;

    const delRes = await request(app)
      .delete(`/payments/${paymentId}`)
      .set(auth(director.token));
    expect(delRes.status).toBe(200);

    const listRes = await request(app)
      .get("/payments")
      .set(auth(director.token));
    expect(listRes.body).toHaveLength(0);
  });

  it("rejects a payment with a tenantId from another agency", async () => {
    const agencyA = await createAgency("a");
    const agencyB = await createAgency("b");

    const { tenantId: tenantFromA } = await createTenantWithUnit(
      agencyA.director.token,
      "a",
    );

    // Agency B tries to record a payment against Agency A's tenant
    const res = await request(app)
      .post("/payments")
      .set(auth(agencyB.director.token))
      .send({ tenantId: tenantFromA, amount: 25000, status: "Paid" });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/not found/i);
  });

  it("director from agency B cannot see agency A's payments", async () => {
    const agencyA = await createAgency("a");
    const agencyB = await createAgency("b");

    const { tenantId } = await createTenantWithUnit(
      agencyA.director.token,
      "a",
    );

    await request(app)
      .post("/payments")
      .set(auth(agencyA.director.token))
      .send({ tenantId, amount: 50000, status: "Paid" });

    const res = await request(app)
      .get("/payments")
      .set(auth(agencyB.director.token));
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(0);
  });
});

// ══════════════════════════════════════════════════════════
// Role permissions
// ══════════════════════════════════════════════════════════
describe("Payments — role permissions", () => {
  it("tenant cannot record a payment (403)", async () => {
    const { director, inviteCode } = await createAgency("a");
    const { token: tenantToken } = await joinAgency(inviteCode, "tenant", "t1");

    const res = await request(app)
      .post("/payments")
      .set(auth(tenantToken))
      .send({ tenant: "Someone", amount: 100, status: "Paid" });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/permission/i);
  });

  it("maintenance-staff cannot view payments (403)", async () => {
    const { inviteCode } = await createAgency("a");
    const { token: maintToken } = await joinAgency(
      inviteCode,
      "maintenance-staff",
      "m1",
    );

    const res = await request(app).get("/payments").set(auth(maintToken));

    expect(res.status).toBe(403);
  });

  it("auditor can view payments but cannot record or delete (403 on writes)", async () => {
    const { director, inviteCode } = await createAgency("a");
    const { token: auditorToken } = await joinAgency(
      inviteCode,
      "auditor",
      "au1",
    );
    const { tenantId } = await createTenantWithUnit(director.token, "a");

    // Seed one payment as director
    const seeded = await request(app)
      .post("/payments")
      .set(auth(director.token))
      .send({ tenantId, amount: 25000, status: "Paid" });

    // Auditor can read
    const listRes = await request(app).get("/payments").set(auth(auditorToken));
    expect(listRes.status).toBe(200);
    expect(listRes.body).toHaveLength(1);

    // Auditor cannot write
    const writeRes = await request(app)
      .post("/payments")
      .set(auth(auditorToken))
      .send({ tenantId, amount: 100, status: "Paid" });
    expect(writeRes.status).toBe(403);

    // Auditor cannot delete
    const delRes = await request(app)
      .delete(`/payments/${seeded.body._id}`)
      .set(auth(auditorToken));
    expect(delRes.status).toBe(403);
  });

  it("finance-officer can record and delete payments", async () => {
    const { director, inviteCode } = await createAgency("a");
    const { token: financeToken } = await joinAgency(
      inviteCode,
      "finance-officer",
      "f1",
    );
    const { tenantId } = await createTenantWithUnit(director.token, "a");

    const createRes = await request(app)
      .post("/payments")
      .set(auth(financeToken))
      .send({ tenantId, amount: 25000, status: "Paid" });
    expect(createRes.status).toBe(201);

    const delRes = await request(app)
      .delete(`/payments/${createRes.body._id}`)
      .set(auth(financeToken));
    expect(delRes.status).toBe(200);
  });

  it("requires authentication for any payment endpoint", async () => {
    const list = await request(app).get("/payments");
    expect(list.status).toBe(401);

    const post = await request(app).post("/payments").send({ amount: 100 });
    expect(post.status).toBe(401);
  });
});

// ══════════════════════════════════════════════════════════
// Tenant self-service
// ══════════════════════════════════════════════════════════
describe("Tenant self-service", () => {
  it("tenant can only see their own summary and receipts", async () => {
    const { director } = await createAgency("a");
    const { tenantEmail } = await createTenantWithUnit(director.token, "a");

    // Log in as the tenant
    const loginRes = await request(app).post("/auth/login").send({
      email: tenantEmail,
      password: "password123",
      role: "tenant",
    });
    expect(loginRes.status).toBe(200);
    const tenantToken = loginRes.body.token;

    // Summary works
    const summaryRes = await request(app)
      .get("/api/tenant/summary")
      .set(auth(tenantToken));
    expect(summaryRes.status).toBe(200);
    expect(summaryRes.body.unit).toBeTruthy();
    expect(summaryRes.body.user.email).toBe(tenantEmail);

    // Receipts works (empty for now)
    const receiptsRes = await request(app)
      .get("/api/tenant/receipts")
      .set(auth(tenantToken));
    expect(receiptsRes.status).toBe(200);
    expect(Array.isArray(receiptsRes.body)).toBe(true);
  });

  it("non-tenant roles cannot access tenant self-service endpoints (403)", async () => {
    const { director } = await createAgency("a");

    const summary = await request(app)
      .get("/api/tenant/summary")
      .set(auth(director.token));
    expect(summary.status).toBe(403);

    const receipts = await request(app)
      .get("/api/tenant/receipts")
      .set(auth(director.token));
    expect(receipts.status).toBe(403);
  });
});

// tests/properties.test.js
// Covers property CRUD and the tenant-isolation security boundary.

const request = require("supertest");
const { setupTestEnv, teardownTestEnv, clearDatabase } = require("./helpers");

let app;

beforeAll(async () => {
  app = await setupTestEnv();
}, 60000);
afterAll(teardownTestEnv);
afterEach(clearDatabase);

/**
 * Register a fresh agency-director and return { token, organizationId }.
 * Every test gets its own agency so tests never bleed into each other.
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
    token: res.body.token,
    organizationId: res.body.organization.id,
  };
}

function auth(token) {
  return { Authorization: `Bearer ${token}` };
}

describe("Properties — CRUD", () => {
  it("creates a property with units in one request", async () => {
    const { token } = await createAgency("a");

    const res = await request(app)
      .post("/api/properties")
      .set(auth(token))
      .send({
        name: "Sunset Apartments",
        type: "Apartment",
        location: "Westlands",
        units: [
          { name: "A-101", price: 25000, status: "Vacant" },
          { name: "A-102", price: 28000, status: "Vacant" },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.property.name).toBe("Sunset Apartments");
    expect(res.body.unitsCreated).toBe(2);
  });

  it("lists only properties from the caller's own agency", async () => {
    const agencyA = await createAgency("a");
    const agencyB = await createAgency("b");

    // Agency A creates a property
    await request(app)
      .post("/api/properties")
      .set(auth(agencyA.token))
      .send({ name: "A-Property" });

    // Agency B creates a property
    await request(app)
      .post("/api/properties")
      .set(auth(agencyB.token))
      .send({ name: "B-Property" });

    // Agency A should only see A-Property
    const aRes = await request(app)
      .get("/api/properties")
      .set(auth(agencyA.token));
    expect(aRes.status).toBe(200);
    expect(aRes.body).toHaveLength(1);
    expect(aRes.body[0].name).toBe("A-Property");

    // Agency B should only see B-Property
    const bRes = await request(app)
      .get("/api/properties")
      .set(auth(agencyB.token));
    expect(bRes.status).toBe(200);
    expect(bRes.body).toHaveLength(1);
    expect(bRes.body[0].name).toBe("B-Property");
  });

  it("returns 404 when fetching another agency's units", async () => {
    const agencyA = await createAgency("a");
    const agencyB = await createAgency("b");

    // Agency A creates a property
    const created = await request(app)
      .post("/api/properties")
      .set(auth(agencyA.token))
      .send({ name: "Secret Tower" });

    const propertyId = created.body.property._id;

    // Agency B tries to load Agency A's units
    const res = await request(app)
      .get(`/api/properties/${propertyId}/units`)
      .set(auth(agencyB.token));

    expect(res.status).toBe(404);
    expect(res.body.message).toMatch(/not found/i);
  });

  it("cannot update another agency's property", async () => {
    const agencyA = await createAgency("a");
    const agencyB = await createAgency("b");

    const created = await request(app)
      .post("/api/properties")
      .set(auth(agencyA.token))
      .send({ name: "Original Name" });

    const propertyId = created.body.property._id;

    // Agency B tries to rename it
    const res = await request(app)
      .put(`/api/properties/${propertyId}`)
      .set(auth(agencyB.token))
      .send({ name: "Hijacked" });

    expect(res.status).toBe(404);

    // Confirm the name is unchanged
    const check = await request(app)
      .get("/api/properties")
      .set(auth(agencyA.token));
    expect(check.body[0].name).toBe("Original Name");
  });

  it("cannot delete another agency's property", async () => {
    const agencyA = await createAgency("a");
    const agencyB = await createAgency("b");

    const created = await request(app)
      .post("/api/properties")
      .set(auth(agencyA.token))
      .send({ name: "Do Not Delete" });

    const propertyId = created.body.property._id;

    // Agency B tries to delete it
    const res = await request(app)
      .delete(`/api/properties/${propertyId}`)
      .set(auth(agencyB.token));

    expect(res.status).toBe(404);

    // Confirm it's still there
    const check = await request(app)
      .get("/api/properties")
      .set(auth(agencyA.token));
    expect(check.body).toHaveLength(1);
    expect(check.body[0].name).toBe("Do Not Delete");
  });

  it("deleting a property cascades and deletes its units", async () => {
    const { token } = await createAgency("a");

    const created = await request(app)
      .post("/api/properties")
      .set(auth(token))
      .send({
        name: "Cascade Test",
        units: [
          { name: "U-1", price: 10000 },
          { name: "U-2", price: 12000 },
        ],
      });

    const propertyId = created.body.property._id;

    // Units exist
    const unitsBefore = await request(app).get("/products").set(auth(token));
    expect(unitsBefore.body).toHaveLength(2);

    // Delete the property
    const delRes = await request(app)
      .delete(`/api/properties/${propertyId}`)
      .set(auth(token));
    expect(delRes.status).toBe(200);

    // Units are gone
    const unitsAfter = await request(app).get("/products").set(auth(token));
    expect(unitsAfter.body).toHaveLength(0);
  });

  it("requires authentication to list properties", async () => {
    const res = await request(app).get("/api/properties");
    expect(res.status).toBe(401);
  });
});

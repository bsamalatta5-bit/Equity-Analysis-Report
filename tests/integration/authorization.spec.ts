import { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import {
  bootstrapApp,
  createTestTenant,
  loginAgent,
  migratorPrisma,
  resetAuthRateLimits,
  type TestTenantFixture,
} from "./fixtures";

describe("Auth and authorization (Module 3)", () => {
  let app: INestApplication;
  let fixture: TestTenantFixture;

  beforeAll(async () => {
    await resetAuthRateLimits();
    app = await bootstrapApp();
    fixture = await createTestTenant({
      owner: { role: "tenant_owner", password: "OwnerPassw0rd!123" },
      manager: { role: "location_manager", password: "ManagerPassw0rd!123" },
      frontDesk: { role: "front_desk_user", password: "FrontDeskPassw0rd!123" },
    });
  });

  afterAll(async () => {
    await app.close();
    await migratorPrisma.$disconnect();
  });

  it("A3.6: rejects an unauthenticated request with 401 and no resource data", async () => {
    const res = await request(app.getHttpServer()).get(`/tenants/${fixture.tenantId}`);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("UNAUTHENTICATED");
    expect(res.body).not.toHaveProperty("legalName");
  });

  it("A3.4: tenant_owner login requires TOTP even with a correct password", async () => {
    const res = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: fixture.users["owner"]!.email, password: fixture.users["owner"]!.password });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("totp_required");
    expect(res.headers["set-cookie"]).toBeUndefined();
  });

  it("A3.2: the session cookie carries httpOnly, Secure, SameSite=Strict, Path=/", async () => {
    const res = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: fixture.users["frontDesk"]!.email, password: fixture.users["frontDesk"]!.password });
    const sessionCookie = (res.headers["set-cookie"] as unknown as string[]).find((c) =>
      c.startsWith("__Host-session="),
    );
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie).toContain("HttpOnly");
    expect(sessionCookie).toContain("Secure");
    expect(sessionCookie).toMatch(/SameSite=Strict/i);
    expect(sessionCookie).toContain("Path=/");
  });

  it("A3.7: tenant_owner can update the tenant profile; front_desk_user cannot (403)", async () => {
    const owner = await loginAgent(app, fixture.users["owner"]!);
    const ownerRes = await owner.agent
      .patch(`/tenants/${fixture.tenantId}`)
      .set("x-csrf-token", owner.csrfToken)
      .send({ legalName: "Updated By Owner" });
    expect(ownerRes.status).toBe(200);

    const frontDesk = await loginAgent(app, fixture.users["frontDesk"]!);
    const frontDeskRes = await frontDesk.agent
      .patch(`/tenants/${fixture.tenantId}`)
      .set("x-csrf-token", frontDesk.csrfToken)
      .send({ legalName: "Updated By Front Desk" });
    expect(frontDeskRes.status).toBe(403);
    expect(frontDeskRes.body).not.toHaveProperty("legalName");
  });

  it("A3.7: front_desk_user cannot create a location (owner-only)", async () => {
    const frontDesk = await loginAgent(app, fixture.users["frontDesk"]!);
    const res = await frontDesk.agent
      .post(`/tenants/${fixture.tenantId}/locations`)
      .set("x-csrf-token", frontDesk.csrfToken)
      .send({ name: "Unauthorized Branch", addressLine: "x", timezone: "Asia/Riyadh" });
    expect(res.status).toBe(403);
  });

  it("A3.9: a state-changing request without the CSRF header is rejected even with a valid session", async () => {
    const owner = await loginAgent(app, fixture.users["owner"]!);
    const res = await owner.agent.patch(`/tenants/${fixture.tenantId}`).send({ legalName: "No CSRF" });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("CSRF_TOKEN_INVALID");
  });

  it("A3.5: repeated bad-password attempts for one account are rate limited", async () => {
    const email = `ratelimit-${Date.now()}@test.example`;
    await migratorPrisma.user.create({
      data: {
        tenantId: fixture.tenantId,
        email,
        passwordHash: "$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHRzb21lc2FsdA$WMKGnDhbjZ2FBSD+3xnI9Q9a3v6dYyN3N8b8Uu5o5sQ",
        role: "front_desk_user",
        status: "active",
      },
    });

    let lastStatus = 0;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const res = await request(app.getHttpServer())
        .post("/auth/login")
        .send({ email, password: "wrong-password" });
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
  });
});

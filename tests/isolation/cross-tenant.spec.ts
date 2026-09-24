import { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  bootstrapApp,
  createTestTenant,
  loginAgent,
  migratorPrisma,
  resetAuthRateLimits,
  type AuthenticatedAgent,
  type TestTenantFixture,
} from "../integration/fixtures";

/**
 * A2.4: an isolation test proves tenant A cannot read or write any record
 * of tenant B through any endpoint. Two independent tenants are created;
 * every case below is attempted as an authenticated tenant A principal
 * against tenant B's data, through the real HTTP surface (not by calling
 * services directly), so both the route-level tenantId check
 * (assertTenantAccess) and the database-level RLS policy are exercised.
 */
describe("Cross-tenant isolation (A2.4)", () => {
  let app: INestApplication;
  let tenantA: TestTenantFixture;
  let tenantB: TestTenantFixture;
  let ownerA: AuthenticatedAgent;

  beforeAll(async () => {
    await resetAuthRateLimits();
    app = await bootstrapApp();
    tenantA = await createTestTenant({ owner: { role: "tenant_owner", password: "OwnerAPassw0rd!123" } });
    tenantB = await createTestTenant({ owner: { role: "tenant_owner", password: "OwnerBPassw0rd!123" } });
    ownerA = await loginAgent(app, tenantA.users["owner"]!);
  });

  afterAll(async () => {
    await app.close();
    await migratorPrisma.$disconnect();
  });

  it("cannot read tenant B's profile via tenant B's own tenantId in the path", async () => {
    const res = await ownerA.agent.get(`/tenants/${tenantB.tenantId}`);
    expect(res.status).toBe(403);
    expect(res.body).not.toHaveProperty("legalName");
  });

  it("cannot write tenant B's profile via tenant B's own tenantId in the path", async () => {
    const res = await ownerA.agent
      .patch(`/tenants/${tenantB.tenantId}`)
      .set("x-csrf-token", ownerA.csrfToken)
      .send({ legalName: "Hijacked" });
    expect(res.status).toBe(403);

    const stillOriginal = await migratorPrisma.tenant.findUniqueOrThrow({ where: { id: tenantB.tenantId } });
    expect(stillOriginal.legalName).not.toBe("Hijacked");
  });

  it("RLS blocks reading tenant B's location even addressed under tenant A's own path (DB-level, not just route-level)", async () => {
    const res = await ownerA.agent.get(
      `/tenants/${tenantA.tenantId}/locations/${tenantB.locationId}`,
    );
    expect(res.status).toBe(404);
    expect(res.body).not.toHaveProperty("name");
  });

  it("tenant A's location list never contains tenant B's locations", async () => {
    const res = await ownerA.agent.get(`/tenants/${tenantA.tenantId}/locations`);
    expect(res.status).toBe(200);
    const ids: string[] = res.body.map((l: { id: string }) => l.id);
    expect(ids).not.toContain(tenantB.locationId);
    expect(ids).not.toContain(tenantB.otherLocationId);
  });

  it("cannot book an appointment against tenant B's location/staff/service from tenant A's path", async () => {
    const res = await ownerA.agent
      .post(`/tenants/${tenantA.tenantId}/appointments`)
      .set("x-csrf-token", ownerA.csrfToken)
      .send({
        source: "dashboard",
        locationId: tenantB.locationId,
        staffMemberId: tenantB.staffMemberId,
        serviceId: tenantB.serviceId,
        startAt: "2035-01-01T09:00:00.000Z",
        contact: { phoneE164: "+966501111111", displayName: "Cross Tenant Attempt" },
      });
    expect(res.status).toBe(404);

    const leakedContact = await migratorPrisma.contact.findFirst({
      where: { tenantId: tenantB.tenantId, phoneE164: "+966501111111" },
    });
    expect(leakedContact).toBeNull();
  });

  it("tenant A's audit log never contains tenant B's entries", async () => {
    const ownerB = await loginAgent(app, tenantB.users["owner"]!);
    await ownerB.agent
      .patch(`/tenants/${tenantB.tenantId}`)
      .set("x-csrf-token", ownerB.csrfToken)
      .send({ legalName: "Tenant B Renamed" });

    const res = await ownerA.agent.get(`/tenants/${tenantA.tenantId}/audit-log`);
    expect(res.status).toBe(200);
    const tenantIds = new Set((res.body as { tenantId: string }[]).map((r) => r.tenantId));
    expect(tenantIds.has(tenantB.tenantId)).toBe(false);

    const crossRes = await ownerA.agent.get(`/tenants/${tenantB.tenantId}/audit-log`);
    expect(crossRes.status).toBe(403);
  });

  it("a raw voice_app connection scoped to tenant A never returns tenant B's rows even for a direct table query", async () => {
    const { PrismaClient } = await import("@prisma/client");
    const appPrisma = new PrismaClient({ datasources: { db: { url: process.env["DATABASE_URL"]! } } });
    try {
      await appPrisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant_id = '${tenantA.tenantId}'`);
        const tenantRows = await tx.tenant.findMany();
        expect(tenantRows.map((t) => t.id)).not.toContain(tenantB.tenantId);
        expect(tenantRows.map((t) => t.id)).toContain(tenantA.tenantId);

        const locationRows = await tx.location.findMany();
        expect(locationRows.map((l) => l.id)).not.toContain(tenantB.locationId);
      });
    } finally {
      await appPrisma.$disconnect();
    }
  });
});

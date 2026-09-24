import { afterAll, describe, expect, it } from "vitest";
import { migratorPrisma } from "./fixtures";

/**
 * Section 5.1 acceptance: "a migration test asserts each constraint exists
 * in information_schema or pg_constraint after prisma migrate deploy
 * against an empty database. A missing constraint fails the build." This
 * suite assumes migrations have already been applied (Section 8's setup
 * order: migrate deploy runs before tests).
 */
describe("Section 5.1 hand-authored migration constraints", () => {
  afterAll(async () => {
    await migratorPrisma.$disconnect();
  });

  it("5.1a: Appointment has the appointment_no_overlap exclusion constraint", async () => {
    const rows = await migratorPrisma.$queryRaw<{ contype: string }[]>`
      SELECT contype FROM pg_constraint WHERE conname = 'appointment_no_overlap'
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.contype).toBe("x"); // exclusion constraint
  });

  it("5.1b: pgvector extension and knowledge_item_embedding_idx exist", async () => {
    const extension = await migratorPrisma.$queryRaw<{ extname: string }[]>`
      SELECT extname FROM pg_extension WHERE extname = 'vector'
    `;
    expect(extension).toHaveLength(1);

    const index = await migratorPrisma.$queryRaw<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes WHERE indexname = 'knowledge_item_embedding_idx'
    `;
    expect(index).toHaveLength(1);
  });

  it("5.1c: row-level security is enabled and forced on every tenant-scoped table", async () => {
    const tables = [
      "Tenant",
      "Location",
      "PhoneNumber",
      "User",
      "Contact",
      "Call",
      "KnowledgeItem",
      "AuditLog",
      "Subscription",
      "UsageRecord",
      "StaffMember",
      "Service",
      "Appointment",
      "EscalationRule",
      "CallTurn",
      "ConsentRecord",
      "AvailabilityRule",
      "BlockedPeriod",
    ];

    const rows = await migratorPrisma.$queryRaw<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }[]>`
      SELECT relname, relrowsecurity, relforcerowsecurity
      FROM pg_class
      WHERE relname = ANY(${tables})
    `;

    expect(rows).toHaveLength(tables.length);
    for (const row of rows) {
      expect(row.relrowsecurity, `${row.relname} should have RLS enabled`).toBe(true);
      expect(row.relforcerowsecurity, `${row.relname} should FORCE RLS`).toBe(true);
    }
  });

  it("5.1c: a connection with no app.current_tenant_id set returns zero rows (A2.3)", async () => {
    // voice_app is non-superuser, so RLS applies; no SET LOCAL was issued
    // on this raw connection, so app_current_tenant_id() is NULL.
    const appPrisma = new (await import("@prisma/client")).PrismaClient({
      datasources: { db: { url: process.env["DATABASE_URL"]! } },
    });
    try {
      const rows = await appPrisma.$queryRaw<{ count: bigint }[]>`SELECT count(*) FROM "Tenant"`;
      expect(Number(rows[0]?.count)).toBe(0);
    } finally {
      await appPrisma.$disconnect();
    }
  });

  it("5.1d: voice_app can INSERT/SELECT on AuditLog but not UPDATE/DELETE", async () => {
    const rows = await migratorPrisma.$queryRaw<
      { can_select: boolean; can_insert: boolean; can_update: boolean; can_delete: boolean }[]
    >`
      SELECT
        has_table_privilege('voice_app', '"AuditLog"', 'SELECT') AS can_select,
        has_table_privilege('voice_app', '"AuditLog"', 'INSERT') AS can_insert,
        has_table_privilege('voice_app', '"AuditLog"', 'UPDATE') AS can_update,
        has_table_privilege('voice_app', '"AuditLog"', 'DELETE') AS can_delete
    `;
    expect(rows[0]?.can_select).toBe(true);
    expect(rows[0]?.can_insert).toBe(true);
    expect(rows[0]?.can_update).toBe(false);
    expect(rows[0]?.can_delete).toBe(false);
  });

  it("5.1e: composite indexes exist on Call and Appointment", async () => {
    const rows = await migratorPrisma.$queryRaw<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes
      WHERE indexname IN ('Call_tenantId_startedAt_idx', 'Appointment_locationId_startAt_idx')
    `;
    expect(rows.map((r) => r.indexname).sort()).toEqual(
      ["Appointment_locationId_startAt_idx", "Call_tenantId_startedAt_idx"].sort(),
    );
  });
});

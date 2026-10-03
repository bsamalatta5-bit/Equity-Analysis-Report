import { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type request from "supertest";
import {
  bootstrapApp,
  createTestTenant,
  loginAgent,
  migratorPrisma,
  resetAuthRateLimits,
  type AuthenticatedAgent,
  type TestTenantFixture,
} from "./fixtures";

describe("Scheduling domain (Module 4)", () => {
  let app: INestApplication;
  let fixture: TestTenantFixture;
  let owner: AuthenticatedAgent;

  beforeAll(async () => {
    await resetAuthRateLimits();
    app = await bootstrapApp();
    fixture = await createTestTenant({
      owner: { role: "tenant_owner", password: "OwnerPassw0rd!123" },
      frontDesk: { role: "front_desk_user", password: "FrontDeskPassw0rd!123" },
    });
    owner = await loginAgent(app, fixture.users["owner"]!);
  });

  afterAll(async () => {
    await app.close();
    await migratorPrisma.$disconnect();
  });

  it("A4.1: open slots exclude blocked periods, existing appointments, and respect timezone", async () => {
    // Location timezone is Asia/Riyadh (+03:00). 09:00 local on 2030-03-04 is 06:00 UTC.
    await migratorPrisma.blockedPeriod.create({
      data: {
        staffMemberId: fixture.staffMemberId,
        startAt: new Date("2030-03-04T06:00:00.000Z"),
        endAt: new Date("2030-03-04T06:30:00.000Z"),
        reason: "Blocked for test",
      },
    });

    const existingContact = await migratorPrisma.contact.create({
      data: { tenantId: fixture.tenantId, phoneE164: "+966500000001", displayName: "Existing" },
    });
    await migratorPrisma.appointment.create({
      data: {
        locationId: fixture.locationId,
        staffMemberId: fixture.staffMemberId,
        serviceId: fixture.serviceId,
        contactId: existingContact.id,
        startAt: new Date("2030-03-04T07:00:00.000Z"),
        endAt: new Date("2030-03-04T07:30:00.000Z"),
        status: "confirmed",
        source: "dashboard",
      },
    });

    const res = await owner.agent.get(
      `/tenants/${fixture.tenantId}/locations/${fixture.locationId}/open-slots` +
        `?serviceId=${fixture.serviceId}&staffMemberId=${fixture.staffMemberId}` +
        `&fromDate=2030-03-04T00:00:00.000Z&toDate=2030-03-05T00:00:00.000Z`,
    );
    expect(res.status).toBe(200);
    const slots: { startAt: string; endAt: string }[] = res.body;
    expect(slots.length).toBeGreaterThan(0);

    const overlapsBlocked = slots.some(
      (s) => s.startAt < "2030-03-04T06:30:00.000Z" && s.endAt > "2030-03-04T06:00:00.000Z",
    );
    const overlapsExisting = slots.some(
      (s) => s.startAt < "2030-03-04T07:30:00.000Z" && s.endAt > "2030-03-04T07:00:00.000Z",
    );
    expect(overlapsBlocked).toBe(false);
    expect(overlapsExisting).toBe(false);

    // The query window is [2030-03-04T00:00Z, 2030-03-05T00:00Z). Riyadh is
    // UTC+3, so local midnight on 2030-03-05 — the start of the *next*
    // local calendar day — is 2030-03-04T21:00:00.000Z, which still falls
    // inside that UTC window. A slot generator that iterated raw UTC
    // calendar dates instead of the location's local ones would miss this
    // slot entirely; its presence proves the timezone conversion is what
    // actually drove slot generation.
    expect(slots.some((s) => s.startAt === "2030-03-04T21:00:00.000Z")).toBe(true);
    // And nothing before the requested window leaks in.
    expect(slots.every((s) => s.startAt >= "2030-03-04T00:00:00.000Z")).toBe(true);
  });

  it("A4.2: the open slot query completes at p95 under 200ms against a large appointment dataset", async () => {
    const bulkContact = await migratorPrisma.contact.create({
      data: { tenantId: fixture.tenantId, phoneE164: "+966500000002", displayName: "Bulk" },
    });

    // 2,000 back-to-back appointments for the queried staff member plus
    // 8,000 more spread across other staff members — 10,000 total, matching
    // A4.2's stated dataset size — none overlapping (the exclusion
    // constraint would reject that), packed into a range outside the query
    // window below so the query also exercises "many busy rows to filter
    // past," not just "many rows to return."
    const perfStaff = await migratorPrisma.staffMember.create({
      data: { locationId: fixture.locationId, displayName: "Perf Staff", active: true },
    });
    await migratorPrisma.availabilityRule.create({
      data: {
        staffMemberId: perfStaff.id,
        weekday: 0,
        startTime: "00:00",
        endTime: "23:30",
        effectiveFrom: new Date("2020-01-01"),
      },
    });

    const ownStart = new Date("2031-01-01T00:00:00.000Z");
    const ownRows = Array.from({ length: 2000 }, (_, i) => ({
      locationId: fixture.locationId,
      staffMemberId: perfStaff.id,
      serviceId: fixture.serviceId,
      contactId: bulkContact.id,
      startAt: new Date(ownStart.getTime() + i * 30 * 60_000),
      endAt: new Date(ownStart.getTime() + (i + 1) * 30 * 60_000),
      status: "confirmed" as const,
      source: "import" as const,
    }));
    await migratorPrisma.appointment.createMany({ data: ownRows });

    const otherStaffMembers = await Promise.all(
      Array.from({ length: 20 }, () =>
        migratorPrisma.staffMember.create({
          data: { locationId: fixture.locationId, displayName: "Other Staff", active: true },
        }),
      ),
    );
    for (const other of otherStaffMembers) {
      const rows = Array.from({ length: 400 }, (_, i) => ({
        locationId: fixture.locationId,
        staffMemberId: other.id,
        serviceId: fixture.serviceId,
        contactId: bulkContact.id,
        startAt: new Date(ownStart.getTime() + i * 30 * 60_000),
        endAt: new Date(ownStart.getTime() + (i + 1) * 30 * 60_000),
        status: "confirmed" as const,
        source: "import" as const,
      }));
      await migratorPrisma.appointment.createMany({ data: rows });
    }

    const totalAppointments = await migratorPrisma.appointment.count();
    expect(totalAppointments).toBeGreaterThanOrEqual(10_000);

    // Query a free window for perfStaff, outside the packed range.
    const durations: number[] = [];
    for (let i = 0; i < 20; i += 1) {
      const start = performance.now();
      const res = await owner.agent.get(
        `/tenants/${fixture.tenantId}/locations/${fixture.locationId}/open-slots` +
          `?serviceId=${fixture.serviceId}&staffMemberId=${perfStaff.id}` +
          `&fromDate=2032-01-01T00:00:00.000Z&toDate=2032-01-02T00:00:00.000Z`,
      );
      durations.push(performance.now() - start);
      expect(res.status).toBe(200);
    }
    durations.sort((a, b) => a - b);
    const p95 = durations[Math.floor(durations.length * 0.95)]!;
    expect(p95).toBeLessThan(200);
  }, 60_000);

  it("A4.3: 50 concurrent booking requests for one slot produce exactly one confirmed appointment and 49 SLOT_CONTENTION errors", async () => {
    const contentionStaff = await migratorPrisma.staffMember.create({
      data: { locationId: fixture.locationId, displayName: "Contention Staff", active: true },
    });
    await migratorPrisma.availabilityRule.create({
      data: {
        staffMemberId: contentionStaff.id,
        weekday: 0,
        startTime: "00:00",
        endTime: "23:30",
        effectiveFrom: new Date("2020-01-01"),
      },
    });

    const startAt = "2033-06-01T09:00:00.000Z";
    const bookOne = (i: number) =>
      owner.agent
        .post(`/tenants/${fixture.tenantId}/appointments`)
        .set("x-csrf-token", owner.csrfToken)
        .send({
          source: "dashboard",
          locationId: fixture.locationId,
          staffMemberId: contentionStaff.id,
          serviceId: fixture.serviceId,
          startAt,
          contact: { phoneE164: `+96650000${String(1000 + i).slice(1)}`, displayName: `Concurrent ${i}` },
        });

    // Firing 50 brand-new sockets at a single in-process Node http.Server
    // in one tick can transiently exceed this sandbox's accept-queue
    // handling (ECONNRESET before the request ever reaches Express) — a
    // property of this test harness's connection burst, not of the
    // exclusion constraint under test. A production deployment's listener
    // is provisioned for real concurrent traffic (that's exactly what k6
    // load tests, Section 3, exist to size); here, a transport-level
    // failure (never got an HTTP response at all) is retried a few times
    // with a short backoff so the test measures what A4.3 actually cares
    // about — how many *requests that reached the server* got booked vs.
    // contended — rather than this harness's raw socket capacity.
    async function bookOneResilient(i: number, attemptsLeft = 4): Promise<request.Response> {
      try {
        return await bookOne(i);
      } catch (error) {
        if (attemptsLeft <= 1) {
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, 25));
        return bookOneResilient(i, attemptsLeft - 1);
      }
    }

    const results = await Promise.all(Array.from({ length: 50 }, (_, i) => bookOneResilient(i)));
    const succeeded = results.filter((r) => r.status === 201 || r.status === 200);
    const contended = results.filter((r) => r.body?.code === "SLOT_CONTENTION");

    expect(succeeded).toHaveLength(1);
    expect(contended).toHaveLength(49);

    const rows = await migratorPrisma.appointment.findMany({
      where: { staffMemberId: contentionStaff.id, status: { not: "cancelled" } },
    });
    expect(rows).toHaveLength(1);
  }, 30_000);

  it("A4.4: every appointment status transition writes an audit log entry naming actor, principal type, and source", async () => {
    const contact = await migratorPrisma.contact.create({
      data: { tenantId: fixture.tenantId, phoneE164: "+966500009999", displayName: "Audit Test" },
    });
    const appointment = await migratorPrisma.appointment.create({
      data: {
        locationId: fixture.locationId,
        staffMemberId: fixture.staffMemberId,
        serviceId: fixture.serviceId,
        contactId: contact.id,
        startAt: new Date("2034-01-01T09:00:00.000Z"),
        endAt: new Date("2034-01-01T09:30:00.000Z"),
        status: "confirmed",
        source: "dashboard",
      },
    });

    const res = await owner.agent
      .patch(`/tenants/${fixture.tenantId}/appointments/${appointment.id}/status`)
      .set("x-csrf-token", owner.csrfToken)
      .send({ status: "completed" });
    expect(res.status).toBe(200);

    const auditRows = await migratorPrisma.auditLog.findMany({
      where: { entityType: "Appointment", entityId: appointment.id },
      orderBy: { occurredAt: "desc" },
    });
    expect(auditRows.length).toBeGreaterThan(0);
    const latest = auditRows[0]!;
    expect(latest.actorUserId).toBe(fixture.users["owner"]!.userId);
    expect(latest.actorPrincipalType).toBe("human_user");
    expect(latest.action).toContain("source=dashboard");
    expect(latest.action).toContain("to=completed");
  });
});

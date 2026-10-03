import { randomUUID } from "node:crypto";
import { INestApplication } from "@nestjs/common";
import { THRESHOLDS } from "@voice-receptionist/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import {
  encryptAndStoreRecording,
  loadRecordingStorageConfig,
} from "../../apps/api/src/calls/recording-storage";
import {
  bootstrapApp,
  createTestTenant,
  loginAgent,
  migratorPrisma,
  resetAuthRateLimits,
  type AuthenticatedAgent,
  type TestTenantFixture,
} from "./fixtures";

describe("Calls: metadata, transcripts, recordings (Module 10, A10.2)", () => {
  let app: INestApplication;
  let fixture: TestTenantFixture;
  let callId: string;
  let recordingBytes: Buffer;
  let owner: AuthenticatedAgent;
  let manager: AuthenticatedAgent;
  let frontDesk: AuthenticatedAgent;
  let operator: AuthenticatedAgent;

  beforeAll(async () => {
    await resetAuthRateLimits();
    app = await bootstrapApp();
    fixture = await createTestTenant({
      owner: { role: "tenant_owner", password: "OwnerPassw0rd!123" },
      manager: { role: "location_manager", password: "ManagerPassw0rd!123" },
      frontDesk: { role: "front_desk_user", password: "FrontDeskPassw0rd!123" },
      operator: { role: "platform_operator", password: "OperatorPassw0rd!123" },
    });
    // One login per role for the whole file — A3.5's per-address rate
    // limit (10 attempts/15min) is easy to trip with one login per `it`.
    owner = await loginAgent(app, fixture.users["owner"]!);
    manager = await loginAgent(app, fixture.users["manager"]!);
    frontDesk = await loginAgent(app, fixture.users["frontDesk"]!);
    operator = await loginAgent(app, fixture.users["operator"]!);

    const contact = await migratorPrisma.contact.create({
      data: { tenantId: fixture.tenantId, phoneE164: "+966501112222" },
    });
    const call = await migratorPrisma.call.create({
      data: {
        tenantId: fixture.tenantId,
        locationId: fixture.locationId,
        contactId: contact.id,
        direction: "inbound",
        startedAt: new Date(),
      },
    });
    callId = call.id;
    await migratorPrisma.consentRecord.create({
      data: { callId, recordingConsented: true, announcementPlayedAt: new Date() },
    });
    await migratorPrisma.callTurn.create({
      data: {
        callId,
        sequence: 0,
        speaker: "caller",
        transcriptText: "hello, this is a test call",
        occurredAt: new Date(),
      },
    });

    recordingBytes = Buffer.from("fake WAV bytes for a test recording — not real audio");
    const objectKey = `${fixture.tenantId}/${callId}`;
    await encryptAndStoreRecording(loadRecordingStorageConfig(), objectKey, recordingBytes);
    await migratorPrisma.call.update({
      where: { id: callId },
      data: {
        recordingObjectKey: objectKey,
        recordingExpiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it("every role listed in the RBAC matrix (including platform_operator) can list call metadata", async () => {
    for (const agent of [owner, manager, frontDesk, operator]) {
      const res = await agent.agent
        .get(`/tenants/${fixture.tenantId}/locations/${fixture.locationId}/calls`)
        .set("x-csrf-token", agent.csrfToken);
      expect(res.status).toBe(200);
      expect((res.body as { id: string }[]).some((c) => c.id === callId)).toBe(true);
    }
  });

  it("front_desk_user can read the transcript; platform_operator cannot (403)", async () => {
    const transcriptRes = await frontDesk.agent
      .get(`/tenants/${fixture.tenantId}/locations/${fixture.locationId}/calls/${callId}/transcript`)
      .set("x-csrf-token", frontDesk.csrfToken);
    expect(transcriptRes.status).toBe(200);
    expect(transcriptRes.body.turns).toHaveLength(1);
    expect(transcriptRes.body.turns[0].transcriptText).toBe("hello, this is a test call");

    const forbidden = await operator.agent
      .get(`/tenants/${fixture.tenantId}/locations/${fixture.locationId}/calls/${callId}/transcript`)
      .set("x-csrf-token", operator.csrfToken);
    expect(forbidden.status).toBe(403);
  });

  it("A10.2: tenant_owner can issue a recording signed URL; front_desk_user and platform_operator cannot (403)", async () => {
    const frontDeskForbidden = await frontDesk.agent
      .get(`/tenants/${fixture.tenantId}/locations/${fixture.locationId}/calls/${callId}/recording`)
      .set("x-csrf-token", frontDesk.csrfToken);
    expect(frontDeskForbidden.status).toBe(403);

    const operatorForbidden = await operator.agent
      .get(`/tenants/${fixture.tenantId}/locations/${fixture.locationId}/calls/${callId}/recording`)
      .set("x-csrf-token", operator.csrfToken);
    expect(operatorForbidden.status).toBe(403);

    const issued = await owner.agent
      .get(`/tenants/${fixture.tenantId}/locations/${fixture.locationId}/calls/${callId}/recording`)
      .set("x-csrf-token", owner.csrfToken);
    expect(issued.status).toBe(200);
    expect(issued.body.url).toMatch(/^\/recordings\//);

    const ttlSeconds = (new Date(issued.body.expiresAt).getTime() - Date.now()) / 1000;
    expect(ttlSeconds).toBeGreaterThan(THRESHOLDS.RECORDING_SIGNED_URL_TTL_SECONDS - 10);
    expect(ttlSeconds).toBeLessThanOrEqual(THRESHOLDS.RECORDING_SIGNED_URL_TTL_SECONDS);

    // The signed URL itself needs no session at all — it is its own authorization.
    const fetched = await request(app.getHttpServer()).get(issued.body.url as string);
    expect(fetched.status).toBe(200);
    expect((fetched.body as Buffer).equals(recordingBytes)).toBe(true);
  });

  it("A10.2: a tampered or malformed recording token is rejected (403), not served", async () => {
    const issued = await owner.agent
      .get(`/tenants/${fixture.tenantId}/locations/${fixture.locationId}/calls/${callId}/recording`)
      .set("x-csrf-token", owner.csrfToken);
    const url = issued.body.url as string;

    const tampered = await request(app.getHttpServer()).get(`${url}tampered`);
    expect(tampered.status).toBe(403);

    const garbage = await request(app.getHttpServer()).get(`/recordings/${randomUUID()}`);
    expect(garbage.status).toBe(403);
  });

  it("issuing a recording URL for a call with no recording returns 404", async () => {
    const contact = await migratorPrisma.contact.create({
      data: { tenantId: fixture.tenantId, phoneE164: "+966503334444" },
    });
    const callWithNoRecording = await migratorPrisma.call.create({
      data: {
        tenantId: fixture.tenantId,
        locationId: fixture.locationId,
        contactId: contact.id,
        direction: "inbound",
        startedAt: new Date(),
      },
    });

    const res = await owner.agent
      .get(
        `/tenants/${fixture.tenantId}/locations/${fixture.locationId}/calls/${callWithNoRecording.id}/recording`,
      )
      .set("x-csrf-token", owner.csrfToken);
    expect(res.status).toBe(404);
  });
});

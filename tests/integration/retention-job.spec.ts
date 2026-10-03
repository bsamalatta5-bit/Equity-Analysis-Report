import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  encryptAndStoreRecording,
  type RecordingStorageConfig,
} from "../../apps/api/src/calls/recording-storage";
import { runRetentionJob } from "../../apps/api/src/retention/retention-job";
import { migratorPrisma } from "./fixtures";

describe("runRetentionJob (A10.3)", () => {
  let storageDir: string;
  let storageConfig: RecordingStorageConfig;
  let tenantId: string;
  let locationId: string;

  beforeAll(async () => {
    const suffix = randomUUID().slice(0, 8);
    const tenant = await migratorPrisma.tenant.create({
      data: {
        legalName: `Retention Test ${suffix}`,
        commercialRegistration: `CR-${suffix}`,
        status: "active",
        planCode: "test",
      },
    });
    const location = await migratorPrisma.location.create({
      data: { tenantId: tenant.id, name: "Main", addressLine: "x", timezone: "Asia/Riyadh", active: true },
    });
    tenantId = tenant.id;
    locationId = location.id;
  });

  beforeEach(async () => {
    storageDir = await mkdtemp(join(tmpdir(), "retention-job-test-"));
    storageConfig = { storageDir, encryptionKey: randomBytes(32), signingSecret: "test-signing-secret" };
  });

  afterEach(async () => {
    await rm(storageDir, { recursive: true, force: true });
  });

  async function createCallAndContact(startedAt: Date) {
    const contact = await migratorPrisma.contact.create({
      data: { tenantId, phoneE164: `+9665${Math.floor(10000000 + Math.random() * 89999999)}` },
    });
    const call = await migratorPrisma.call.create({
      data: { tenantId, locationId, contactId: contact.id, direction: "inbound", startedAt },
    });
    return call.id;
  }

  it("deletes an expired recording's encrypted object and clears the Call's recording fields, with an audit entry", async () => {
    const now = new Date("2030-06-01T00:00:00.000Z");
    const callId = await createCallAndContact(new Date());
    const objectKey = `${tenantId}/${callId}`;
    await encryptAndStoreRecording(storageConfig, objectKey, randomBytes(128));
    await migratorPrisma.call.update({
      where: { id: callId },
      data: { recordingObjectKey: objectKey, recordingExpiresAt: new Date(now.getTime() - 1000) },
    });

    const result = await runRetentionJob(migratorPrisma, storageConfig, now);
    expect(result.recordingsDeleted).toBeGreaterThanOrEqual(1);

    const call = await migratorPrisma.call.findUniqueOrThrow({ where: { id: callId } });
    expect(call.recordingObjectKey).toBeNull();
    expect(call.recordingExpiresAt).toBeNull();

    await expect(readFile(join(storageDir, `${objectKey}.enc`))).rejects.toThrow();

    const auditEntry = await migratorPrisma.auditLog.findFirst({
      where: {
        tenantId,
        action: "retention.recordings_deleted",
        occurredAt: { gte: new Date(Date.now() - 60_000) },
      },
      orderBy: { occurredAt: "desc" },
    });
    expect(auditEntry).not.toBeNull();
    expect(auditEntry!.actorPrincipalType).toBe("retention_job");
    expect(auditEntry!.actorUserId).toBeNull();
    expect((auditEntry!.details as { deletedCount: number } | null)?.deletedCount).toBeGreaterThanOrEqual(1);
  });

  it("leaves a not-yet-expired recording untouched", async () => {
    const now = new Date("2030-06-01T00:00:00.000Z");
    const callId = await createCallAndContact(new Date());
    const objectKey = `${tenantId}/${callId}`;
    await encryptAndStoreRecording(storageConfig, objectKey, randomBytes(64));
    await migratorPrisma.call.update({
      where: { id: callId },
      data: {
        recordingObjectKey: objectKey,
        recordingExpiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      },
    });

    await runRetentionJob(migratorPrisma, storageConfig, now);

    const call = await migratorPrisma.call.findUniqueOrThrow({ where: { id: callId } });
    expect(call.recordingObjectKey).toBe(objectKey);
    const onDisk = await readFile(join(storageDir, `${objectKey}.enc`));
    expect(onDisk.length).toBeGreaterThan(0);
  });

  it("deletes CallTurn rows older than the 24-month transcript retention window, with an audit entry", async () => {
    const now = new Date("2030-06-01T00:00:00.000Z");
    const oldCallStartedAt = new Date("2028-01-01T00:00:00.000Z"); // well over 24 months before `now`
    const oldCallId = await createCallAndContact(oldCallStartedAt);
    await migratorPrisma.consentRecord.create({
      data: { callId: oldCallId, recordingConsented: false, announcementPlayedAt: oldCallStartedAt },
    });
    await migratorPrisma.callTurn.create({
      data: {
        callId: oldCallId,
        sequence: 0,
        speaker: "caller",
        transcriptText: "this transcript must be deleted",
        occurredAt: oldCallStartedAt,
      },
    });

    const recentCallId = await createCallAndContact(new Date(now.getTime() - 60_000));
    await migratorPrisma.consentRecord.create({
      data: { callId: recentCallId, recordingConsented: false, announcementPlayedAt: new Date() },
    });
    await migratorPrisma.callTurn.create({
      data: {
        callId: recentCallId,
        sequence: 0,
        speaker: "caller",
        transcriptText: "this transcript must survive",
        occurredAt: new Date(now.getTime() - 60_000),
      },
    });

    const result = await runRetentionJob(migratorPrisma, storageConfig, now);
    expect(result.transcriptsDeleted).toBeGreaterThanOrEqual(1);

    const oldTurns = await migratorPrisma.callTurn.findMany({ where: { callId: oldCallId } });
    expect(oldTurns).toHaveLength(0);

    const recentTurns = await migratorPrisma.callTurn.findMany({ where: { callId: recentCallId } });
    expect(recentTurns).toHaveLength(1);

    const auditEntry = await migratorPrisma.auditLog.findFirst({
      where: {
        tenantId,
        action: "retention.transcripts_deleted",
        occurredAt: { gte: new Date(Date.now() - 60_000) },
      },
      orderBy: { occurredAt: "desc" },
    });
    expect(auditEntry).not.toBeNull();
    expect(auditEntry!.actorPrincipalType).toBe("retention_job");
  });
});

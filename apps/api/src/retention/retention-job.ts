import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { THRESHOLDS } from "@voice-receptionist/shared";
import { deleteRecording, type RecordingStorageConfig } from "../calls/recording-storage";

export interface RetentionRunResult {
  readonly recordingsDeleted: number;
  readonly transcriptsDeleted: number;
  readonly tenantsWithRecordingsAffected: number;
  readonly tenantsWithTranscriptsAffected: number;
}

function groupCountByTenant(rows: readonly { tenantId: string }[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    counts.set(row.tenantId, (counts.get(row.tenantId) ?? 0) + 1);
  }
  return counts;
}

/**
 * A10.3: deletes recordings at 90 days and transcripts at 24 months,
 * writing one audit entry per affected tenant per category (AuditLog is
 * tenant-scoped by schema — Section 5 — so a single cross-tenant "batch"
 * entry has nowhere to attach that isn't a tenant; one row per tenant is
 * this schema's honest expression of "an entry per deletion batch").
 *
 * `prisma` must be a connection that bypasses RLS (the migrator role —
 * see run-retention.ts) — CallTurn and ConsentRecord's RLS policies
 * deliberately do not grant platform-operator cross-tenant bypass (see
 * this module's own ADR note in docs/adr/version-substitutions.md), and
 * this job spans every tenant in one run, matching A3.8's Retention Job
 * principal: "workload identity, no ingress path."
 */
export async function runRetentionJob(
  prisma: PrismaClient,
  storageConfig: RecordingStorageConfig,
  now: Date = new Date(),
): Promise<RetentionRunResult> {
  const transcriptCutoff = new Date(now);
  transcriptCutoff.setMonth(transcriptCutoff.getMonth() - THRESHOLDS.TRANSCRIPT_RETENTION_MONTHS);

  const expiredRecordings = await prisma.call.findMany({
    where: { recordingObjectKey: { not: null }, recordingExpiresAt: { lt: now } },
    select: { id: true, tenantId: true, recordingObjectKey: true },
  });
  for (const call of expiredRecordings) {
    await deleteRecording(storageConfig, call.recordingObjectKey!);
  }
  if (expiredRecordings.length > 0) {
    await prisma.call.updateMany({
      where: { id: { in: expiredRecordings.map((c) => c.id) } },
      data: { recordingObjectKey: null, recordingExpiresAt: null },
    });
  }
  const recordingCountsByTenant = groupCountByTenant(expiredRecordings);
  for (const [tenantId, deletedCount] of recordingCountsByTenant) {
    await prisma.auditLog.create({
      data: {
        tenantId,
        actorUserId: null,
        actorPrincipalType: "retention_job",
        action: "retention.recordings_deleted",
        entityType: "RetentionBatch",
        entityId: randomUUID(),
        details: { deletedCount, cutoffAt: now.toISOString() },
      },
    });
  }

  const expiredCallTurns = await prisma.callTurn.findMany({
    where: { call: { startedAt: { lt: transcriptCutoff } } },
    select: { id: true, call: { select: { tenantId: true } } },
  });
  if (expiredCallTurns.length > 0) {
    await prisma.callTurn.deleteMany({ where: { id: { in: expiredCallTurns.map((t) => t.id) } } });
  }
  const transcriptCountsByTenant = groupCountByTenant(
    expiredCallTurns.map((t) => ({ tenantId: t.call.tenantId })),
  );
  for (const [tenantId, deletedCount] of transcriptCountsByTenant) {
    await prisma.auditLog.create({
      data: {
        tenantId,
        actorUserId: null,
        actorPrincipalType: "retention_job",
        action: "retention.transcripts_deleted",
        entityType: "RetentionBatch",
        entityId: randomUUID(),
        details: { deletedCount, cutoffAt: transcriptCutoff.toISOString() },
      },
    });
  }

  return {
    recordingsDeleted: expiredRecordings.length,
    transcriptsDeleted: expiredCallTurns.length,
    tenantsWithRecordingsAffected: recordingCountsByTenant.size,
    tenantsWithTranscriptsAffected: transcriptCountsByTenant.size,
  };
}

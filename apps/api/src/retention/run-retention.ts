import { PrismaClient } from "@prisma/client";
import { loadRecordingStorageConfig } from "../calls/recording-storage";
import { runRetentionJob } from "./retention-job";

/**
 * A10.3's scheduled job entry point — invoked by a scheduler (cron,
 * Cloud Scheduler, etc., per infra/terraform, Module 13 — not built this
 * session), never by an HTTP route (A3.8: "Retention Job | Workload
 * identity, no ingress path"). Connects via DATABASE_MIGRATOR_URL with no
 * override, the same pattern prisma/seed.ts uses — see
 * schema.prisma's own datasource comment.
 */
async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const result = await runRetentionJob(prisma, loadRecordingStorageConfig());
    // eslint-disable-next-line no-console -- a standalone CLI script, not the running API; packages/logger's redaction is for request-serving processes, and nothing sensitive is printed here (counts only).
    console.log(
      `Retention job complete: ${result.recordingsDeleted} recording(s) deleted across ${result.tenantsWithRecordingsAffected} tenant(s); ` +
        `${result.transcriptsDeleted} transcript turn(s) deleted across ${result.tenantsWithTranscriptsAffected} tenant(s).`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main();

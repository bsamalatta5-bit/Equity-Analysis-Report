import type { Prisma } from "@prisma/client";

export function periodStartFor(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

/** A11.1: billable minutes round up to the next whole minute — the standard telecom convention, so a 61-second call bills as 2 minutes, and any call that connected at all bills at least 1. */
export function computeBillableMinutes(startedAt: Date, endedAt: Date): number {
  const elapsedMs = Math.max(0, endedAt.getTime() - startedAt.getTime());
  return Math.max(1, Math.ceil(elapsedMs / 60_000));
}

export interface RecordCallUsageParams {
  readonly tenantId: string;
  readonly startedAt: Date;
  readonly endedAt: Date;
}

/**
 * A11.1: "Billable minutes accumulate per tenant per period." Called from
 * webhook-handler.ts's handleCallEnd, inside the same withTenant
 * transaction that sets Call.endedAt. The period is a calendar month in
 * UTC, keyed by its first instant — UsageRecord's existing
 * `@@unique([tenantId, periodStart])` (Section 5, present since Module 2)
 * is exactly this key.
 */
export async function recordCallUsage(
  tx: Prisma.TransactionClient,
  params: RecordCallUsageParams,
): Promise<void> {
  const billableMinutes = computeBillableMinutes(params.startedAt, params.endedAt);
  const periodStart = periodStartFor(params.startedAt);

  const subscription = await tx.subscription.findFirst({
    where: { tenantId: params.tenantId, status: "active" },
  });
  const includedMinutes = subscription?.includedMinutes ?? 0;

  const existing = await tx.usageRecord.findUnique({
    where: { tenantId_periodStart: { tenantId: params.tenantId, periodStart } },
  });
  const totalBillableMinutes = (existing?.billableMinutes ?? 0) + billableMinutes;
  const overageMinutes = Math.max(0, totalBillableMinutes - includedMinutes);

  await tx.usageRecord.upsert({
    where: { tenantId_periodStart: { tenantId: params.tenantId, periodStart } },
    create: {
      tenantId: params.tenantId,
      periodStart,
      billableMinutes: totalBillableMinutes,
      overageMinutes,
    },
    update: { billableMinutes: totalBillableMinutes, overageMinutes },
  });
}

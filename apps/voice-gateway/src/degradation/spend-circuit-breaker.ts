import type { Prisma } from "@prisma/client";
import { periodStartFor } from "../usage/usage-accounting";

export type SpendCircuitBreakerResult =
  | { readonly breached: false }
  | { readonly breached: true; readonly subscriptionId: string };

/**
 * A11.3: "A monthly spend circuit breaker suspends provider calls and
 * raises an alert on breach." Checked once per call, in
 * DialogueStateMachine.start() — before any provider is ever invoked for
 * that call (see its own comment for why that's the right hook point).
 *
 * No real vendor pricing exists yet (Module 1's halt gate — no provider
 * has been selected, so there is no real bill to measure against); the
 * per-minute cost is a plan-level figure configured on Subscription
 * instead, so the mechanism itself — accumulate spend, compare to a cap,
 * suspend, alert once — is real and vendor-agnostic even though the rate
 * behind today's number isn't tied to a selected vendor's invoice yet.
 *
 * `monthlySpendCapCents: null` means no cap is configured; the breaker
 * never trips for that subscription. The first call that crosses the cap
 * marks `spendCapBreachedAt` and writes the one audit "alert" — every
 * later call in the same period finds it already set and stays silent
 * (an alert, once raised, doesn't repeat every call for the rest of the
 * month), while `breached: true` is still returned (and provider calls
 * are still suspended) for all of them.
 */
export async function checkSpendCircuitBreaker(
  tx: Prisma.TransactionClient,
  tenantId: string,
  now: Date,
): Promise<SpendCircuitBreakerResult> {
  const subscription = await tx.subscription.findFirst({ where: { tenantId, status: "active" } });
  if (!subscription || subscription.monthlySpendCapCents === null) {
    return { breached: false };
  }

  const periodStart = periodStartFor(now);
  const usage = await tx.usageRecord.findUnique({
    where: { tenantId_periodStart: { tenantId, periodStart } },
  });
  const spendCents = (usage?.billableMinutes ?? 0) * subscription.costPerBillableMinuteCents;

  if (spendCents < subscription.monthlySpendCapCents) {
    return { breached: false };
  }

  if (!subscription.spendCapBreachedAt) {
    await tx.subscription.update({ where: { id: subscription.id }, data: { spendCapBreachedAt: now } });
    await tx.auditLog.create({
      data: {
        tenantId,
        actorUserId: null,
        actorPrincipalType: "voice_gateway",
        action: "usage.spend_cap_breached",
        entityType: "Subscription",
        entityId: subscription.id,
        details: {
          spendCents,
          monthlySpendCapCents: subscription.monthlySpendCapCents,
          periodStart: periodStart.toISOString(),
        },
      },
    });
  }

  return { breached: true, subscriptionId: subscription.id };
}

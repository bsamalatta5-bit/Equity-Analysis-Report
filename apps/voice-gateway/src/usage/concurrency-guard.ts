import type { Prisma } from "@prisma/client";
import { ConcurrencyLimitReachedError } from "@voice-receptionist/shared";
import type { CallSessionStore } from "../session/call-session-store";

export const CONCURRENCY_LIMIT_BUSY_MESSAGE =
  "We're currently at capacity and cannot take your call right now. Please try again shortly. " +
  "نواجه ضغطًا كبيرًا حاليًا ولا يمكننا استقبال مكالمتك. يرجى المحاولة لاحقًا.";

/**
 * A11.2: "A per-tenant concurrent call ceiling rejects calls above the
 * limit with a spoken busy message." Checked before any Call row is
 * created — webhook-handler.ts's handleCallStart calls this immediately
 * after resolving the tenant, the same point A5.1's signature/replay
 * checks already gate call creation on, so a rejected call creates no
 * record either, consistent with that precedent.
 *
 * No real telephony provider exists to literally speak
 * CONCURRENCY_LIMIT_BUSY_MESSAGE as audio (Module 1's halt gate — see
 * docs/adr/dialect-feasibility-verdict.md); this defines the text, the
 * same "text, not audio delivery" posture every other assistant utterance
 * in this build takes.
 */
export async function checkConcurrencyLimit(
  tx: Prisma.TransactionClient,
  sessionStore: CallSessionStore,
  tenantId: string,
): Promise<void> {
  const subscription = await tx.subscription.findFirst({ where: { tenantId, status: "active" } });
  const limit = subscription?.concurrentCallLimit ?? 5;
  const activeCount = await sessionStore.countActiveForTenant(tenantId);
  if (activeCount >= limit) {
    throw new ConcurrencyLimitReachedError(CONCURRENCY_LIMIT_BUSY_MESSAGE);
  }
}

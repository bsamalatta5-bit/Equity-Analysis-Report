import type { Prisma } from "@prisma/client";
import { isTimeWithinActiveHours, escalationActiveHoursSchema } from "@voice-receptionist/shared";
import { toZonedTime } from "date-fns-tz";

export interface ProviderFailureEscalationParams {
  readonly locationId: string;
  readonly now: Date;
}

export type ProviderFailureDecision = { readonly kind: "transfer" } | { readonly kind: "message_capture" };

/**
 * A9.5: "Provider failure transfers the call within 3 seconds, or captures
 * a message with a callback request outside escalation active hours."
 * Looks up this location's EscalationRule for triggerType "provider_failure"
 * (Section 5.1's schema — see apps/api/src/escalation for how it's
 * authored). No rule configured at all defaults to "transfer": a transfer
 * is the safer failure mode than silently capturing a message no one
 * expects to check.
 */
export async function decideProviderFailureEscalation(
  tx: Prisma.TransactionClient,
  params: ProviderFailureEscalationParams,
): Promise<ProviderFailureDecision> {
  const location = await tx.location.findUniqueOrThrow({ where: { id: params.locationId } });
  const rule = await tx.escalationRule.findFirst({
    where: { locationId: params.locationId, triggerType: "provider_failure" },
  });
  if (!rule) {
    return { kind: "transfer" };
  }

  const activeHours = escalationActiveHoursSchema.parse(rule.activeHours);
  const zoned = toZonedTime(params.now, location.timezone);
  const weekday = zoned.getUTCDay();
  const timeOfDay = `${zoned.getUTCHours().toString().padStart(2, "0")}:${zoned
    .getUTCMinutes()
    .toString()
    .padStart(2, "0")}`;

  return isTimeWithinActiveHours(activeHours, weekday, timeOfDay)
    ? { kind: "transfer" }
    : { kind: "message_capture" };
}

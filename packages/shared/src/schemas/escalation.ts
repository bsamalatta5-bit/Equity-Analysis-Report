import { z } from "zod";
import { ESCALATION_TRIGGER_TYPE } from "../constants/enums";
import { e164PhoneSchema } from "./common";

const TIME_OF_DAY_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export const escalationActiveHoursWindowSchema = z.object({
  /** 0 = Sunday, matching JS Date#getDay() / Date#getUTCDay(). */
  weekday: z.number().int().min(0).max(6),
  startTime: z.string().regex(TIME_OF_DAY_PATTERN, "Expected HH:MM (24-hour)."),
  endTime: z.string().regex(TIME_OF_DAY_PATTERN, "Expected HH:MM (24-hour)."),
});
export type EscalationActiveHoursWindow = z.infer<typeof escalationActiveHoursWindowSchema>;

export const escalationActiveHoursSchema = z.object({
  windows: z.array(escalationActiveHoursWindowSchema),
});
export type EscalationActiveHours = z.infer<typeof escalationActiveHoursSchema>;

/**
 * A9.5: "outside escalation active hours" is evaluated against these
 * windows. Pure and timezone-agnostic on purpose — the caller (
 * apps/voice-gateway/src/degradation/provider-failure.ts) converts a real
 * Date + the location's IANA timezone into (weekday, "HH:MM") via
 * date-fns-tz before calling this, so this package stays free of a
 * date-fns-tz dependency it has no other use for.
 */
export function isTimeWithinActiveHours(
  activeHours: EscalationActiveHours,
  weekday: number,
  timeOfDay: string,
): boolean {
  return activeHours.windows.some(
    (window) => window.weekday === weekday && window.startTime <= timeOfDay && timeOfDay < window.endTime,
  );
}

export const createEscalationRuleRequestSchema = z.object({
  triggerType: z.enum(ESCALATION_TRIGGER_TYPE),
  targetPhoneE164: e164PhoneSchema,
  activeHours: escalationActiveHoursSchema,
});
export type CreateEscalationRuleRequest = z.infer<typeof createEscalationRuleRequestSchema>;

export const updateEscalationRuleRequestSchema = createEscalationRuleRequestSchema.partial();
export type UpdateEscalationRuleRequest = z.infer<typeof updateEscalationRuleRequestSchema>;

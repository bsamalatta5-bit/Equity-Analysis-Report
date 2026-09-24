import { z } from "zod";

const timeOfDaySchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected HH:mm in 24-hour format.");

export const createAvailabilityRuleRequestSchema = z
  .object({
    staffMemberId: z.string().uuid(),
    weekday: z.number().int().min(0).max(6),
    startTime: timeOfDaySchema,
    endTime: timeOfDaySchema,
    effectiveFrom: z.coerce.date(),
    effectiveTo: z.coerce.date().optional(),
  })
  .refine((rule) => rule.startTime < rule.endTime, {
    message: "startTime must be earlier than endTime.",
    path: ["endTime"],
  })
  .refine((rule) => rule.effectiveTo === undefined || rule.effectiveTo >= rule.effectiveFrom, {
    message: "effectiveTo must not precede effectiveFrom.",
    path: ["effectiveTo"],
  });
export type CreateAvailabilityRuleRequest = z.infer<typeof createAvailabilityRuleRequestSchema>;

export const createBlockedPeriodRequestSchema = z
  .object({
    staffMemberId: z.string().uuid(),
    startAt: z.coerce.date(),
    endAt: z.coerce.date(),
    reason: z.string().min(1).max(300),
  })
  .refine((period) => period.startAt < period.endAt, {
    message: "startAt must be earlier than endAt.",
    path: ["endAt"],
  });
export type CreateBlockedPeriodRequest = z.infer<typeof createBlockedPeriodRequestSchema>;

export const openSlotQuerySchema = z.object({
  locationId: z.string().uuid(),
  serviceId: z.string().uuid(),
  staffMemberId: z.string().uuid().optional(),
  fromDate: z.coerce.date(),
  toDate: z.coerce.date(),
});
export type OpenSlotQuery = z.infer<typeof openSlotQuerySchema>;

export const openSlotSchema = z.object({
  staffMemberId: z.string().uuid(),
  startAt: z.coerce.date(),
  endAt: z.coerce.date(),
});
export type OpenSlot = z.infer<typeof openSlotSchema>;

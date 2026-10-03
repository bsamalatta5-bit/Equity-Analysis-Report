import { z } from "zod";
import { APPOINTMENT_STATUS } from "../constants/enums";
import { upsertContactRequestSchema } from "./contact";

/**
 * A7.1: the booking write executes only after explicit spoken caller
 * confirmation of service, staff, date, and time. For voice_call bookings
 * the dialogue state machine (apps/voice-gateway) is the only caller of this
 * schema with source "voice_call", and it must supply `callerConfirmed:
 * true` — set only once the Confirmation state has recorded the caller's
 * affirmative response to each of the four slots.
 */
const dashboardBookingSchema = z.object({
  source: z.literal("dashboard"),
  locationId: z.string().uuid(),
  staffMemberId: z.string().uuid(),
  serviceId: z.string().uuid(),
  startAt: z.coerce.date(),
  contact: upsertContactRequestSchema,
});

const voiceCallBookingSchema = z.object({
  source: z.literal("voice_call"),
  locationId: z.string().uuid(),
  staffMemberId: z.string().uuid(),
  serviceId: z.string().uuid(),
  startAt: z.coerce.date(),
  contact: upsertContactRequestSchema,
  callId: z.string().uuid(),
  callerConfirmed: z.literal(true),
});

const importBookingSchema = z.object({
  source: z.literal("import"),
  locationId: z.string().uuid(),
  staffMemberId: z.string().uuid(),
  serviceId: z.string().uuid(),
  startAt: z.coerce.date(),
  contact: upsertContactRequestSchema,
});

export const createAppointmentRequestSchema = z.discriminatedUnion("source", [
  dashboardBookingSchema,
  voiceCallBookingSchema,
  importBookingSchema,
]);
export type CreateAppointmentRequest = z.infer<typeof createAppointmentRequestSchema>;

export const rescheduleAppointmentRequestSchema = z.object({
  startAt: z.coerce.date(),
  staffMemberId: z.string().uuid().optional(),
});
export type RescheduleAppointmentRequest = z.infer<typeof rescheduleAppointmentRequestSchema>;

export const updateAppointmentStatusRequestSchema = z.object({
  status: z.enum(APPOINTMENT_STATUS),
});
export type UpdateAppointmentStatusRequest = z.infer<typeof updateAppointmentStatusRequestSchema>;

export const listAppointmentsQuerySchema = z.object({
  locationId: z.string().uuid(),
  fromDate: z.coerce.date().optional(),
  toDate: z.coerce.date().optional(),
  status: z.enum(APPOINTMENT_STATUS).optional(),
});
export type ListAppointmentsQuery = z.infer<typeof listAppointmentsQuerySchema>;

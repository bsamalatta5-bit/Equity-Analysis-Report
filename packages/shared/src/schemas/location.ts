import { z } from "zod";
import { PHONE_NUMBER_STATUS } from "../constants/enums";
import { e164PhoneSchema, isoTimezoneSchema } from "./common";

export const createLocationRequestSchema = z.object({
  name: z.string().min(1).max(200),
  addressLine: z.string().min(1).max(300),
  timezone: isoTimezoneSchema,
  active: z.boolean().default(true),
});
export type CreateLocationRequest = z.infer<typeof createLocationRequestSchema>;

export const updateLocationRequestSchema = createLocationRequestSchema.partial();
export type UpdateLocationRequest = z.infer<typeof updateLocationRequestSchema>;

export const createPhoneNumberRequestSchema = z.object({
  locationId: z.string().uuid(),
  e164Number: e164PhoneSchema,
  providerReference: z.string().min(1).max(200),
});
export type CreatePhoneNumberRequest = z.infer<typeof createPhoneNumberRequestSchema>;

export const updatePhoneNumberRequestSchema = z.object({
  status: z.enum(PHONE_NUMBER_STATUS),
});
export type UpdatePhoneNumberRequest = z.infer<typeof updatePhoneNumberRequestSchema>;

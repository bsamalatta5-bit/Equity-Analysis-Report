import { z } from "zod";

export const uuidSchema = z.string().uuid();

export const e164PhoneSchema = z
  .string()
  .regex(/^\+[1-9]\d{6,14}$/, "Phone number must be in E.164 format, e.g. +9665XXXXXXXX.");

export const isoTimezoneSchema = z.string().min(1).max(64);

export const paginationQuerySchema = z.object({
  cursor: uuidSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export const localizedTextSchema = z.object({
  ar: z.string().min(1).max(500),
  en: z.string().min(1).max(500),
});

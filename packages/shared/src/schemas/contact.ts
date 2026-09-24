import { z } from "zod";
import { KNOWLEDGE_LANGUAGE } from "../constants/enums";
import { e164PhoneSchema } from "./common";

export const upsertContactRequestSchema = z.object({
  phoneE164: e164PhoneSchema,
  displayName: z.string().min(1).max(200).optional(),
  preferredLanguage: z.enum(KNOWLEDGE_LANGUAGE).optional(),
});
export type UpsertContactRequest = z.infer<typeof upsertContactRequestSchema>;

export const updateContactRequestSchema = z.object({
  displayName: z.string().min(1).max(200).optional(),
  preferredLanguage: z.enum(KNOWLEDGE_LANGUAGE).optional(),
});
export type UpdateContactRequest = z.infer<typeof updateContactRequestSchema>;

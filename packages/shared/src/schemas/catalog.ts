import { z } from "zod";

export const createServiceRequestSchema = z.object({
  nameAr: z.string().min(1).max(200),
  nameEn: z.string().min(1).max(200),
  durationMinutes: z.number().int().min(5).max(480),
  statedPrice: z.number().nonnegative().max(1_000_000),
  active: z.boolean().default(true),
});
export type CreateServiceRequest = z.infer<typeof createServiceRequestSchema>;

export const updateServiceRequestSchema = createServiceRequestSchema.partial();
export type UpdateServiceRequest = z.infer<typeof updateServiceRequestSchema>;

export const createStaffMemberRequestSchema = z.object({
  displayName: z.string().min(1).max(200),
  active: z.boolean().default(true),
});
export type CreateStaffMemberRequest = z.infer<typeof createStaffMemberRequestSchema>;

export const updateStaffMemberRequestSchema = createStaffMemberRequestSchema.partial();
export type UpdateStaffMemberRequest = z.infer<typeof updateStaffMemberRequestSchema>;

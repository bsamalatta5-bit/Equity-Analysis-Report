import { z } from "zod";
import { TENANT_STATUS, USER_ROLE, USER_STATUS } from "../constants/enums";
import { uuidSchema } from "./common";

export const createTenantRequestSchema = z.object({
  legalName: z.string().min(1).max(200),
  commercialRegistration: z.string().min(1).max(50),
  planCode: z.string().min(1).max(50),
});
export type CreateTenantRequest = z.infer<typeof createTenantRequestSchema>;

export const updateTenantRequestSchema = z.object({
  legalName: z.string().min(1).max(200).optional(),
  status: z.enum(TENANT_STATUS).optional(),
});
export type UpdateTenantRequest = z.infer<typeof updateTenantRequestSchema>;

export const createTenantUserRequestSchema = z.object({
  email: z.string().email().max(320),
  role: z.enum(USER_ROLE),
  locationIds: z.array(uuidSchema).default([]),
});
export type CreateTenantUserRequest = z.infer<typeof createTenantUserRequestSchema>;

export const updateTenantUserRequestSchema = z.object({
  role: z.enum(USER_ROLE).optional(),
  status: z.enum(USER_STATUS).optional(),
  locationIds: z.array(uuidSchema).optional(),
});
export type UpdateTenantUserRequest = z.infer<typeof updateTenantUserRequestSchema>;

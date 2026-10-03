import type { UserRole, UserStatus } from "@voice-receptionist/shared";
import { apiFetch } from "../api/client";

export interface TenantUser {
  readonly id: string;
  readonly email: string;
  readonly role: UserRole;
  readonly status: UserStatus;
}

export function listTenantUsers(tenantId: string): Promise<TenantUser[]> {
  return apiFetch(`/tenants/${tenantId}/users`);
}

export interface TenantUserDetail extends TenantUser {
  readonly locationIds: readonly string[];
}

export function getTenantUser(tenantId: string, userId: string): Promise<TenantUserDetail> {
  return apiFetch(`/tenants/${tenantId}/users/${userId}`);
}

export interface CreateTenantUserInput {
  email: string;
  role: UserRole;
  locationIds: string[];
}

export interface CreateTenantUserResult extends TenantUser {
  readonly temporaryPassword: string;
}

export function createTenantUser(
  tenantId: string,
  data: CreateTenantUserInput,
): Promise<CreateTenantUserResult> {
  return apiFetch(`/tenants/${tenantId}/users`, { method: "POST", body: data });
}

export interface UpdateTenantUserInput {
  role?: UserRole;
  status?: UserStatus;
  locationIds?: string[];
}

export function updateTenantUser(
  tenantId: string,
  userId: string,
  data: UpdateTenantUserInput,
): Promise<TenantUser> {
  return apiFetch(`/tenants/${tenantId}/users/${userId}`, { method: "PATCH", body: data });
}

export function disableTenantUser(tenantId: string, userId: string): Promise<{ status: "ok" }> {
  return apiFetch(`/tenants/${tenantId}/users/${userId}`, { method: "DELETE" });
}

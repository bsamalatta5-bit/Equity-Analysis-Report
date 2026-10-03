import type { TenantStatus } from "@voice-receptionist/shared";
import { apiFetch } from "../api/client";

export interface TenantDetails {
  readonly id: string;
  readonly legalName: string;
  readonly commercialRegistration: string;
  readonly status: TenantStatus;
  readonly planCode: string;
}

export function getTenant(tenantId: string): Promise<TenantDetails> {
  return apiFetch(`/tenants/${tenantId}`);
}

export interface UpdateTenantInput {
  legalName?: string;
  status?: TenantStatus;
}

export function updateTenant(tenantId: string, data: UpdateTenantInput): Promise<TenantDetails> {
  return apiFetch(`/tenants/${tenantId}`, { method: "PATCH", body: data });
}

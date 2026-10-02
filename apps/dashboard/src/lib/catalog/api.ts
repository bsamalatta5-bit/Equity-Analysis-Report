import { apiFetch } from "../api/client";

export interface ServiceSummary {
  readonly id: string;
  readonly nameAr: string;
  readonly nameEn: string;
  readonly durationMinutes: number;
  readonly statedPrice: number;
  readonly active: boolean;
}

export interface StaffMemberSummary {
  readonly id: string;
  readonly displayName: string;
  readonly active: boolean;
}

export function listServices(tenantId: string, locationId: string): Promise<ServiceSummary[]> {
  return apiFetch(`/tenants/${tenantId}/locations/${locationId}/services`);
}

export function listStaff(tenantId: string, locationId: string): Promise<StaffMemberSummary[]> {
  return apiFetch(`/tenants/${tenantId}/locations/${locationId}/staff`);
}

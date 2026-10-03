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

export interface ServiceInput {
  nameAr: string;
  nameEn: string;
  durationMinutes: number;
  statedPrice: number;
  active: boolean;
}

export function createService(
  tenantId: string,
  locationId: string,
  data: ServiceInput,
): Promise<ServiceSummary> {
  return apiFetch(`/tenants/${tenantId}/locations/${locationId}/services`, { method: "POST", body: data });
}

export function updateService(
  tenantId: string,
  locationId: string,
  serviceId: string,
  data: Partial<ServiceInput>,
): Promise<ServiceSummary> {
  return apiFetch(`/tenants/${tenantId}/locations/${locationId}/services/${serviceId}`, {
    method: "PATCH",
    body: data,
  });
}

export function listStaff(tenantId: string, locationId: string): Promise<StaffMemberSummary[]> {
  return apiFetch(`/tenants/${tenantId}/locations/${locationId}/staff`);
}

export interface StaffMemberInput {
  displayName: string;
  active: boolean;
}

export function createStaffMember(
  tenantId: string,
  locationId: string,
  data: StaffMemberInput,
): Promise<StaffMemberSummary> {
  return apiFetch(`/tenants/${tenantId}/locations/${locationId}/staff`, { method: "POST", body: data });
}

export function updateStaffMember(
  tenantId: string,
  locationId: string,
  staffMemberId: string,
  data: Partial<StaffMemberInput>,
): Promise<StaffMemberSummary> {
  return apiFetch(`/tenants/${tenantId}/locations/${locationId}/staff/${staffMemberId}`, {
    method: "PATCH",
    body: data,
  });
}

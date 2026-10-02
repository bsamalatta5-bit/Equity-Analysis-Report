import { apiFetch } from "../api/client";

export interface CreatedLocation {
  readonly id: string;
  readonly name: string;
}

export function createLocation(
  tenantId: string,
  data: { name: string; addressLine: string; timezone: string },
): Promise<CreatedLocation> {
  return apiFetch(`/tenants/${tenantId}/locations`, {
    method: "POST",
    body: { ...data, active: true },
  });
}

export function createService(
  tenantId: string,
  locationId: string,
  data: { nameAr: string; nameEn: string; durationMinutes: number; statedPrice: number },
): Promise<{ id: string }> {
  return apiFetch(`/tenants/${tenantId}/locations/${locationId}/services`, {
    method: "POST",
    body: { ...data, active: true },
  });
}

export function createStaffMember(
  tenantId: string,
  locationId: string,
  data: { displayName: string },
): Promise<{ id: string }> {
  return apiFetch(`/tenants/${tenantId}/locations/${locationId}/staff`, {
    method: "POST",
    body: { ...data, active: true },
  });
}

export function createPhoneNumber(
  tenantId: string,
  data: { locationId: string; e164Number: string; providerReference: string },
): Promise<{ id: string }> {
  return apiFetch(`/tenants/${tenantId}/phone-numbers`, { method: "POST", body: data });
}

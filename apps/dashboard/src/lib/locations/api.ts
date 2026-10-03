import type { PhoneNumberStatus } from "@voice-receptionist/shared";
import { apiFetch } from "../api/client";

export interface LocationSummary {
  readonly id: string;
  readonly name: string;
  readonly addressLine: string;
  readonly timezone: string;
  readonly active: boolean;
}

export function listLocations(tenantId: string): Promise<LocationSummary[]> {
  return apiFetch(`/tenants/${tenantId}/locations`);
}

export interface LocationInput {
  name: string;
  addressLine: string;
  timezone: string;
  active: boolean;
}

export function createLocation(tenantId: string, data: LocationInput): Promise<LocationSummary> {
  return apiFetch(`/tenants/${tenantId}/locations`, { method: "POST", body: data });
}

export function updateLocation(
  tenantId: string,
  locationId: string,
  data: Partial<LocationInput>,
): Promise<LocationSummary> {
  return apiFetch(`/tenants/${tenantId}/locations/${locationId}`, { method: "PATCH", body: data });
}

export interface PhoneNumberSummary {
  readonly id: string;
  readonly locationId: string;
  readonly e164Number: string;
  readonly providerReference: string;
  readonly status: PhoneNumberStatus;
}

export function listPhoneNumbers(tenantId: string, locationId: string): Promise<PhoneNumberSummary[]> {
  return apiFetch(`/tenants/${tenantId}/phone-numbers?locationId=${locationId}`);
}

export function createPhoneNumber(
  tenantId: string,
  data: { locationId: string; e164Number: string; providerReference: string },
): Promise<PhoneNumberSummary> {
  return apiFetch(`/tenants/${tenantId}/phone-numbers`, { method: "POST", body: data });
}

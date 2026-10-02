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

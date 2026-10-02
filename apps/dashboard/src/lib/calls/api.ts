import { apiFetch } from "../api/client";

export interface CallSummary {
  readonly id: string;
  readonly locationId: string;
  readonly contactId: string | null;
  readonly direction: "inbound" | "outbound";
  readonly startedAt: string;
  readonly endedAt: string | null;
  readonly disposition: string | null;
  readonly containmentFlag: boolean;
}

export function listCalls(tenantId: string, locationId: string): Promise<CallSummary[]> {
  return apiFetch(`/tenants/${tenantId}/locations/${locationId}/calls`);
}

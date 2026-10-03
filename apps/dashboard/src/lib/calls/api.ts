import type { CallDisposition } from "@voice-receptionist/shared";
import { apiFetch } from "../api/client";
import type { ContactSummary } from "../appointments/api";

export interface CallSummary {
  readonly id: string;
  readonly locationId: string;
  readonly contactId: string | null;
  readonly contact: ContactSummary | null;
  readonly direction: "inbound" | "outbound";
  readonly startedAt: string;
  readonly endedAt: string | null;
  readonly disposition: CallDisposition | null;
  readonly containmentFlag: boolean;
}

export function listCalls(tenantId: string, locationId: string): Promise<CallSummary[]> {
  return apiFetch(`/tenants/${tenantId}/locations/${locationId}/calls`);
}

export interface CallTurn {
  readonly id: string;
  readonly sequence: number;
  readonly speaker: "caller" | "assistant";
  readonly transcriptText: string;
  readonly occurredAt: string;
}

export interface CallTranscript {
  readonly call: CallSummary;
  readonly turns: readonly CallTurn[];
}

export function getCallTranscript(
  tenantId: string,
  locationId: string,
  callId: string,
): Promise<CallTranscript> {
  return apiFetch(`/tenants/${tenantId}/locations/${locationId}/calls/${callId}/transcript`);
}

export function issueRecordingUrl(
  tenantId: string,
  locationId: string,
  callId: string,
): Promise<{ url: string; expiresAt: string }> {
  return apiFetch(`/tenants/${tenantId}/locations/${locationId}/calls/${callId}/recording`);
}

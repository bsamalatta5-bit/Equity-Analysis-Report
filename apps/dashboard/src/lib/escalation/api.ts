import type { EscalationTriggerType } from "@voice-receptionist/shared";
import { apiFetch } from "../api/client";

export interface EscalationActiveHoursWindow {
  weekday: number;
  startTime: string;
  endTime: string;
}

export interface EscalationRule {
  readonly id: string;
  readonly triggerType: EscalationTriggerType;
  readonly targetPhoneE164: string;
  readonly activeHours: { windows: EscalationActiveHoursWindow[] };
}

export function listEscalationRules(tenantId: string, locationId: string): Promise<EscalationRule[]> {
  return apiFetch(`/tenants/${tenantId}/locations/${locationId}/escalation-rules`);
}

export interface EscalationRuleInput {
  triggerType: EscalationTriggerType;
  targetPhoneE164: string;
  activeHours: { windows: EscalationActiveHoursWindow[] };
}

export function createEscalationRule(
  tenantId: string,
  locationId: string,
  data: EscalationRuleInput,
): Promise<EscalationRule> {
  return apiFetch(`/tenants/${tenantId}/locations/${locationId}/escalation-rules`, {
    method: "POST",
    body: data,
  });
}

export function deleteEscalationRule(
  tenantId: string,
  locationId: string,
  escalationRuleId: string,
): Promise<{ status: string }> {
  return apiFetch(`/tenants/${tenantId}/locations/${locationId}/escalation-rules/${escalationRuleId}`, {
    method: "DELETE",
  });
}

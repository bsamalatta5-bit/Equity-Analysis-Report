import { apiFetch } from "../api/client";

export interface AvailabilityRule {
  readonly id: string;
  readonly staffMemberId: string;
  readonly weekday: number;
  readonly startTime: string;
  readonly endTime: string;
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
}

export function listAvailabilityRules(
  tenantId: string,
  locationId: string,
  staffMemberId: string,
): Promise<AvailabilityRule[]> {
  return apiFetch(`/tenants/${tenantId}/locations/${locationId}/staff/${staffMemberId}/availability-rules`);
}

export interface CreateAvailabilityRuleInput {
  weekday: number;
  startTime: string;
  endTime: string;
  effectiveFrom: string;
}

export function createAvailabilityRule(
  tenantId: string,
  locationId: string,
  staffMemberId: string,
  data: CreateAvailabilityRuleInput,
): Promise<AvailabilityRule> {
  // createAvailabilityRuleRequestSchema requires staffMemberId in the body
  // itself — the controller's own URL param only overrides it afterward,
  // once Zod validation of the raw body has already passed.
  return apiFetch(`/tenants/${tenantId}/locations/${locationId}/staff/${staffMemberId}/availability-rules`, {
    method: "POST",
    body: { ...data, staffMemberId },
  });
}

import { apiFetch } from "../api/client";

export interface Subscription {
  readonly id: string;
  readonly planCode: string;
  readonly includedMinutes: number;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly status: string;
  readonly monthlySpendCapCents: number | null;
}

export interface UsageRecord {
  readonly id: string;
  readonly periodStart: string;
  readonly billableMinutes: number;
  readonly overageMinutes: number;
}

export interface UsageSummary {
  readonly subscription: Subscription | null;
  readonly usageRecords: readonly UsageRecord[];
}

export function getUsage(tenantId: string): Promise<UsageSummary> {
  return apiFetch(`/tenants/${tenantId}/usage`);
}

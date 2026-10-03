import type { KnowledgeLanguage } from "@voice-receptionist/shared";
import { apiFetch } from "../api/client";

export interface KnowledgeItem {
  readonly id: string;
  readonly questionText: string;
  readonly answerText: string;
  readonly language: KnowledgeLanguage;
  readonly active: boolean;
}

export function listKnowledgeItems(tenantId: string): Promise<KnowledgeItem[]> {
  return apiFetch(`/tenants/${tenantId}/knowledge`);
}

export interface KnowledgeItemInput {
  questionText: string;
  answerText: string;
  language: KnowledgeLanguage;
  active: boolean;
}

export function createKnowledgeItem(tenantId: string, data: KnowledgeItemInput): Promise<KnowledgeItem> {
  return apiFetch(`/tenants/${tenantId}/knowledge`, { method: "POST", body: data });
}

export function updateKnowledgeItem(
  tenantId: string,
  knowledgeItemId: string,
  data: Partial<KnowledgeItemInput>,
): Promise<KnowledgeItem> {
  return apiFetch(`/tenants/${tenantId}/knowledge/${knowledgeItemId}`, { method: "PATCH", body: data });
}

export function deleteKnowledgeItem(tenantId: string, knowledgeItemId: string): Promise<{ status: string }> {
  return apiFetch(`/tenants/${tenantId}/knowledge/${knowledgeItemId}`, { method: "DELETE" });
}

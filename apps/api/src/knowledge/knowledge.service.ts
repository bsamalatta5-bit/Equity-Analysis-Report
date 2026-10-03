import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import {
  NotFoundError,
  computeHashingEmbedding,
  toVectorLiteral,
  type CreateKnowledgeItemRequest,
  type KnowledgeLanguage,
  type UpdateKnowledgeItemRequest,
} from "@voice-receptionist/shared";
import { AuditService } from "../audit/audit.service";

export interface KnowledgeItemRow {
  readonly id: string;
  readonly tenantId: string;
  readonly questionText: string;
  readonly answerText: string;
  readonly language: KnowledgeLanguage;
  readonly active: boolean;
}

/**
 * KnowledgeItem.embedding is declared in schema.prisma as
 * Unsupported("vector(1536)"), which Prisma Client omits from every
 * generated input/output type for the model — see
 * tests/integration/schema-parity.spec.ts's KNOWN_UNSUPPORTED_TYPE_FIELDS
 * comment. Every write that touches embedding (create, and update when the
 * text it was computed from changes) goes through $queryRaw/$executeRaw
 * instead of the `tx.knowledgeItem` delegate, mirroring apps/api/prisma/seed.ts.
 */
@Injectable()
export class KnowledgeService {
  constructor(private readonly audit: AuditService) {}

  async listKnowledgeItems(tx: Prisma.TransactionClient, tenantId: string) {
    return tx.knowledgeItem.findMany({ where: { tenantId }, orderBy: { questionText: "asc" } });
  }

  async createKnowledgeItem(
    tx: Prisma.TransactionClient,
    tenantId: string,
    actorUserId: string,
    data: CreateKnowledgeItemRequest,
  ) {
    const id = randomUUID();
    // Embedded from questionText alone, not questionText+answerText: retrieval
    // (apps/voice-gateway/src/knowledge/retrieval.ts) embeds the caller's
    // question and compares it against this same space, so both sides must
    // represent "a question," not a blend of question and answer prose.
    const embedding = toVectorLiteral(computeHashingEmbedding(data.questionText));
    const rows = await tx.$queryRaw<KnowledgeItemRow[]>`
      INSERT INTO "KnowledgeItem" (id, "tenantId", "questionText", "answerText", language, embedding, active)
      VALUES (
        ${id}::uuid,
        ${tenantId}::uuid,
        ${data.questionText},
        ${data.answerText},
        ${data.language}::"KnowledgeLanguage",
        ${embedding}::vector(1536),
        ${data.active}
      )
      RETURNING id, "tenantId", "questionText", "answerText", language, active
    `;
    const item = rows[0]!;
    await this.audit.record({
      tx,
      tenantId,
      actorUserId,
      actorPrincipalType: "human_user",
      action: "knowledge_item.create",
      entityType: "KnowledgeItem",
      entityId: item.id,
    });
    return item;
  }

  async updateKnowledgeItem(
    tx: Prisma.TransactionClient,
    tenantId: string,
    actorUserId: string,
    knowledgeItemId: string,
    data: UpdateKnowledgeItemRequest,
  ) {
    const existing = await tx.knowledgeItem.findUnique({ where: { id: knowledgeItemId } });
    if (!existing || existing.tenantId !== tenantId) {
      throw new NotFoundError("KnowledgeItem", knowledgeItemId);
    }

    const merged = {
      questionText: data.questionText ?? existing.questionText,
      answerText: data.answerText ?? existing.answerText,
      language: data.language ?? existing.language,
      active: data.active ?? existing.active,
    };
    const embedding = toVectorLiteral(computeHashingEmbedding(merged.questionText));

    const rows = await tx.$queryRaw<KnowledgeItemRow[]>`
      UPDATE "KnowledgeItem"
      SET
        "questionText" = ${merged.questionText},
        "answerText" = ${merged.answerText},
        language = ${merged.language}::"KnowledgeLanguage",
        embedding = ${embedding}::vector(1536),
        active = ${merged.active}
      WHERE id = ${knowledgeItemId}::uuid AND "tenantId" = ${tenantId}::uuid
      RETURNING id, "tenantId", "questionText", "answerText", language, active
    `;
    const item = rows[0]!;
    await this.audit.record({
      tx,
      tenantId,
      actorUserId,
      actorPrincipalType: "human_user",
      action: "knowledge_item.update",
      entityType: "KnowledgeItem",
      entityId: knowledgeItemId,
    });
    return item;
  }

  async deleteKnowledgeItem(
    tx: Prisma.TransactionClient,
    tenantId: string,
    actorUserId: string,
    knowledgeItemId: string,
  ) {
    const existing = await tx.knowledgeItem.findUnique({ where: { id: knowledgeItemId } });
    if (!existing || existing.tenantId !== tenantId) {
      throw new NotFoundError("KnowledgeItem", knowledgeItemId);
    }
    await tx.$executeRaw`
      DELETE FROM "KnowledgeItem" WHERE id = ${knowledgeItemId}::uuid AND "tenantId" = ${tenantId}::uuid
    `;
    await this.audit.record({
      tx,
      tenantId,
      actorUserId,
      actorPrincipalType: "human_user",
      action: "knowledge_item.delete",
      entityType: "KnowledgeItem",
      entityId: knowledgeItemId,
    });
  }
}

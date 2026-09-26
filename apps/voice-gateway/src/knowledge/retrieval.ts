import type { Prisma } from "@prisma/client";
import { computeHashingEmbedding, toVectorLiteral, type KnowledgeLanguage } from "@voice-receptionist/shared";

export interface KnowledgeMatch {
  readonly questionText: string;
  readonly answerText: string;
  readonly similarity: number;
}

export interface RetrieveKnowledgeParams {
  readonly tenantId: string;
  readonly queryText: string;
  readonly language: KnowledgeLanguage;
}

/**
 * A8.1: filtered by tenantId at the query level via an explicit
 * `"tenantId" = $tenantId` predicate below, not only by the RLS session
 * variable `tx` already carries — the same defense-in-depth convention
 * tenants.service.ts uses for any table with a direct tenantId column (see
 * its `findMany({ where: { tenantId } })` calls). `tx` must come from
 * `withTenant` (apps/voice-gateway/src/common/prisma-client.ts) so that
 * session variable is set at all; a raw client would return zero rows
 * under KnowledgeItem's FORCE ROW LEVEL SECURITY policy regardless of this
 * predicate.
 *
 * Returns the single nearest KnowledgeItem by pgvector cosine distance
 * (`<=>`), converted to a similarity score (`1 - distance`), or null if no
 * active item in the caller's language exists at all. The A8.2 threshold
 * gate itself lives in the caller (dialogue-state-machine.ts), which must
 * refuse to draft an answer — or pass this match to
 * LanguageModelProvider.draftGroundedResponse at all — when similarity
 * falls below THRESHOLDS.KNOWLEDGE_SIMILARITY_MIN.
 */
export async function retrieveTopKnowledgeMatch(
  tx: Prisma.TransactionClient,
  params: RetrieveKnowledgeParams,
): Promise<KnowledgeMatch | null> {
  const queryEmbedding = toVectorLiteral(computeHashingEmbedding(params.queryText));
  const rows = await tx.$queryRaw<{ questionText: string; answerText: string; similarity: number }[]>`
    SELECT
      "questionText",
      "answerText",
      1 - (embedding <=> ${queryEmbedding}::vector(1536)) AS similarity
    FROM "KnowledgeItem"
    WHERE active = true
      AND "tenantId" = ${params.tenantId}::uuid
      AND language = ${params.language}::"KnowledgeLanguage"
    ORDER BY embedding <=> ${queryEmbedding}::vector(1536)
    LIMIT 1
  `;
  return rows[0] ?? null;
}

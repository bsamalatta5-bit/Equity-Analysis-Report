import type { Prisma } from "@prisma/client";
import {
  ConsentNotRecordedError,
  type CallTurnSpeaker,
  type KnowledgeLanguage,
} from "@voice-receptionist/shared";

export interface RecordCallTurnParams {
  readonly callId: string;
  readonly speaker: CallTurnSpeaker;
  readonly transcriptText: string;
  readonly detectedLanguage?: KnowledgeLanguage | undefined;
  readonly languageConfidence?: number | undefined;
  readonly intent?: string | undefined;
  readonly confidence?: number | undefined;
}

/**
 * A10.1: refuses to persist any caller- or assistant-spoken text until this
 * call's consent announcement has been recorded
 * (ConsentRecord.announcementPlayedAt) — see dialogue-state-machine.ts's
 * start(), the only place that sets it. In this codebase's own call flow
 * that ordering is already guaranteed by construction (handleTurn can only
 * run against a context produced by start(), directly or transitively), but
 * this check turns the guarantee into something real and independently
 * testable rather than an accident of call order.
 *
 * `tx` must come from `withTenant` so RLS scopes both the ConsentRecord
 * lookup and the CallTurn insert to this call's own tenant.
 */
export async function recordCallTurn(
  tx: Prisma.TransactionClient,
  params: RecordCallTurnParams,
): Promise<void> {
  const consent = await tx.consentRecord.findUnique({ where: { callId: params.callId } });
  if (!consent || !consent.announcementPlayedAt) {
    throw new ConsentNotRecordedError(params.callId);
  }

  const sequence = await tx.callTurn.count({ where: { callId: params.callId } });
  await tx.callTurn.create({
    data: {
      callId: params.callId,
      sequence,
      speaker: params.speaker,
      transcriptText: params.transcriptText,
      detectedLanguage: params.detectedLanguage ?? null,
      languageConfidence: params.languageConfidence ?? null,
      intent: params.intent ?? null,
      confidence: params.confidence ?? null,
    },
  });
}

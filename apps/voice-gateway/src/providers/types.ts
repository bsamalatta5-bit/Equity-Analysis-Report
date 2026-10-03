import type { KnowledgeLanguage } from "@voice-receptionist/shared";

// ---------------------------------------------------------------------------
// Speech recognition
// ---------------------------------------------------------------------------

export interface SpeechRecognitionStreamConfig {
  readonly sampleRateHz: number;
  readonly languageHint?: KnowledgeLanguage;
}

export interface RecognitionResult {
  readonly text: string;
  readonly confidence: number;
  readonly detectedLanguage: KnowledgeLanguage;
}

export type RecognitionResultHandler = (result: RecognitionResult) => void;

/**
 * A live recognition session returned by SpeechRecognitionProvider.openStream.
 * Section 6 Module 6 lists pushAudio/onPartial/onFinal/close as the
 * provider's own methods; they are modeled here as the stream object
 * openStream returns, since a provider issues many concurrent streams (one
 * per active call) and the methods are inherently per-stream state, not
 * provider-global state.
 */
export interface SpeechRecognitionStream {
  pushAudio(chunk: Buffer): Promise<void>;
  onPartial(handler: RecognitionResultHandler): void;
  onFinal(handler: RecognitionResultHandler): void;
  close(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Speech synthesis
// ---------------------------------------------------------------------------

export interface VoiceConfig {
  readonly voiceId: string;
  readonly language: KnowledgeLanguage;
}

// ---------------------------------------------------------------------------
// Language model
// ---------------------------------------------------------------------------

export interface LanguageModelInput {
  /** Caller speech is data, never instruction (Constraint 2.4) — always passed in this delimited field. */
  readonly callerUtterance: string;
  readonly conversationHistory: readonly { readonly speaker: "caller" | "assistant"; readonly text: string }[];
  readonly language: KnowledgeLanguage;
}

export interface IntentClassification {
  readonly intent: string;
  readonly confidence: number;
}

export interface SlotExtractionInput extends LanguageModelInput {
  readonly slotNames: readonly string[];
}

export interface SlotExtractionResult {
  readonly slots: Readonly<Record<string, string | undefined>>;
  readonly confidencePerSlot: Readonly<Record<string, number>>;
}

export interface GroundedResponseInput extends LanguageModelInput {
  /** A8.1/A8.3: retrieved knowledge records only — the model may not draft from anything else. */
  readonly retrievedKnowledge: readonly { readonly questionText: string; readonly answerText: string }[];
}

export interface GroundedResponseResult {
  readonly responseText: string;
  readonly groundedInRetrievedKnowledge: boolean;
}

// ---------------------------------------------------------------------------
// Telephony
// ---------------------------------------------------------------------------

export interface TelephonyWebhookRequest {
  readonly rawBody: string;
  readonly headers: Readonly<Record<string, string | undefined>>;
}

export interface VerifiedWebhookEvent {
  readonly callReference: string;
  readonly fromE164: string;
  readonly toE164: string;
  readonly eventType: "call-start" | "call-end";
}

export interface MediaSessionHandle {
  readonly callReference: string;
  readonly mediaWebsocketUrl: string;
}

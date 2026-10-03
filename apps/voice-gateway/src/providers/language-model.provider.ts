import type {
  GroundedResponseInput,
  GroundedResponseResult,
  IntentClassification,
  LanguageModelInput,
  SlotExtractionInput,
  SlotExtractionResult,
} from "./types";

/**
 * Constraint 2.1: the language model holds no database write authority.
 * Every method here is a pure classify/extract/draft call — nothing in
 * this interface can mutate application state. All appointment writes go
 * through apps/api's deterministic booking state machine.
 */
export interface LanguageModelProvider {
  readonly providerName: string;
  classifyIntent(input: LanguageModelInput): Promise<IntentClassification>;
  extractSlots(input: SlotExtractionInput): Promise<SlotExtractionResult>;
  /** Constraint 2.2: the caller returns only from retrievedKnowledge; never invents facts. */
  draftGroundedResponse(input: GroundedResponseInput): Promise<GroundedResponseResult>;
}

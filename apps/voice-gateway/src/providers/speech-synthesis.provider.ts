import type { VoiceConfig } from "./types";

export interface SpeechSynthesisProvider {
  readonly providerName: string;
  /** Returns audio chunks as they become available, so playback can start before synthesis finishes. */
  synthesizeStream(text: string, voiceConfig: VoiceConfig): AsyncIterable<Buffer>;
}

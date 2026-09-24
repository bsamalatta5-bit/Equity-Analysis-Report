import type { SpeechRecognitionStream, SpeechRecognitionStreamConfig } from "./types";

export interface SpeechRecognitionProvider {
  readonly providerName: string;
  openStream(config: SpeechRecognitionStreamConfig): Promise<SpeechRecognitionStream>;
}

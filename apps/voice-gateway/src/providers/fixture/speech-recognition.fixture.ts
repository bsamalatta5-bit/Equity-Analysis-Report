import { ProviderFailureError } from "@voice-receptionist/shared";
import { withTimeout } from "../../common/with-timeout";
import type { SpeechRecognitionProvider } from "../speech-recognition.provider";
import type {
  RecognitionResult,
  RecognitionResultHandler,
  SpeechRecognitionStream,
  SpeechRecognitionStreamConfig,
} from "../types";

const PROVIDER_NAME = "fixture";
const TIMEOUT_MS = 5_000;

export interface FixtureRecognitionScript {
  readonly partials?: readonly RecognitionResult[];
  readonly final: RecognitionResult;
}

/**
 * A6.2: fixture-backed test adapter. Scripts are consumed one per call to
 * openStream, in order, so a test can script an entire scene (each caller
 * turn's recognized text) without a real ASR provider.
 */
export class FixtureSpeechRecognitionProvider implements SpeechRecognitionProvider {
  readonly providerName = PROVIDER_NAME;
  private scriptIndex = 0;

  constructor(private readonly scripts: readonly FixtureRecognitionScript[] = []) {}

  async openStream(config: SpeechRecognitionStreamConfig): Promise<SpeechRecognitionStream> {
    return withTimeout(this.doOpenStream(config), TIMEOUT_MS, PROVIDER_NAME, "openStream");
  }

  private async doOpenStream(config: SpeechRecognitionStreamConfig): Promise<SpeechRecognitionStream> {
    const script = this.scripts[this.scriptIndex] ?? {
      final: { text: "", confidence: 1, detectedLanguage: config.languageHint ?? "en" },
    };
    this.scriptIndex += 1;

    const partialHandlers: RecognitionResultHandler[] = [];
    const finalHandlers: RecognitionResultHandler[] = [];
    let closed = false;

    return {
      async pushAudio(_chunk: Buffer): Promise<void> {
        if (closed) {
          throw new ProviderFailureError(PROVIDER_NAME, "pushAudio", new Error("stream already closed"));
        }
        for (const partial of script.partials ?? []) {
          for (const handler of partialHandlers) handler(partial);
        }
        for (const handler of finalHandlers) handler(script.final);
      },
      onPartial(handler: RecognitionResultHandler): void {
        partialHandlers.push(handler);
      },
      onFinal(handler: RecognitionResultHandler): void {
        finalHandlers.push(handler);
      },
      async close(): Promise<void> {
        closed = true;
      },
    };
  }
}

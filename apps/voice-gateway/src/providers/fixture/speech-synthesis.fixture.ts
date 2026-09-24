import { withTimeout } from "../../common/with-timeout";
import type { SpeechSynthesisProvider } from "../speech-synthesis.provider";
import type { VoiceConfig } from "../types";

const PROVIDER_NAME = "fixture";
const TIMEOUT_MS = 5_000;

/** A6.2: emits the input text, UTF-8 encoded, as a single silent "audio" chunk — enough to exercise the pipeline, not real audio. */
export class FixtureSpeechSynthesisProvider implements SpeechSynthesisProvider {
  readonly providerName = PROVIDER_NAME;

  synthesizeStream(text: string, _voiceConfig: VoiceConfig): AsyncIterable<Buffer> {
    const providerName = this.providerName;
    async function* generate(): AsyncGenerator<Buffer> {
      await withTimeout(Promise.resolve(), TIMEOUT_MS, providerName, "synthesizeStream");
      yield Buffer.from(text, "utf-8");
    }
    return generate();
  }
}

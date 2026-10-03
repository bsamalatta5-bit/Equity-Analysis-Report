import type { Redis } from "ioredis";
import { FixtureLanguageModelProvider } from "./fixture/language-model.fixture";
import { FixtureSpeechRecognitionProvider } from "./fixture/speech-recognition.fixture";
import { FixtureSpeechSynthesisProvider } from "./fixture/speech-synthesis.fixture";
import { FixtureTelephonyProvider } from "./fixture/telephony.fixture";
import type { LanguageModelProvider } from "./language-model.provider";
import { RedisNonceStore } from "../telephony/redis-nonce-store";
import type { SpeechRecognitionProvider } from "./speech-recognition.provider";
import type { SpeechSynthesisProvider } from "./speech-synthesis.provider";
import type { TelephonyProvider } from "./telephony.provider";

/**
 * A6.1: each provider is selected by environment variable, and
 * substitution requires no change outside the adapter directory and
 * configuration — callers depend only on the interface types above, never
 * on a concrete adapter class, so adding e.g. a real
 * SPEECH_RECOGNITION_PROVIDER=azure case here (plus its adapter file) is
 * the only change a real integration needs.
 *
 * Every case besides "fixture" is unimplemented — see
 * docs/adr/dialect-feasibility-verdict.md for why: no provider has
 * cleared Module 1's feasibility gate yet, so none has been integrated.
 */
export function createSpeechRecognitionProvider(providerName: string): SpeechRecognitionProvider {
  switch (providerName) {
    case "fixture":
      return new FixtureSpeechRecognitionProvider();
    default:
      throw new Error(
        `Unknown SPEECH_RECOGNITION_PROVIDER "${providerName}". No real provider is integrated yet — see docs/adr/dialect-feasibility-verdict.md.`,
      );
  }
}

export function createSpeechSynthesisProvider(providerName: string): SpeechSynthesisProvider {
  switch (providerName) {
    case "fixture":
      return new FixtureSpeechSynthesisProvider();
    default:
      throw new Error(
        `Unknown SPEECH_SYNTHESIS_PROVIDER "${providerName}". No real provider is integrated yet — see docs/adr/dialect-feasibility-verdict.md.`,
      );
  }
}

export function createLanguageModelProvider(providerName: string): LanguageModelProvider {
  switch (providerName) {
    case "fixture":
      return new FixtureLanguageModelProvider();
    default:
      throw new Error(
        `Unknown LANGUAGE_MODEL_PROVIDER "${providerName}". No real provider is integrated yet — see docs/adr/dialect-feasibility-verdict.md.`,
      );
  }
}

export function createTelephonyProvider(
  providerName: string,
  signingSecret: string,
  redis: Redis,
): TelephonyProvider {
  switch (providerName) {
    case "fixture":
      return new FixtureTelephonyProvider(signingSecret, new RedisNonceStore(redis));
    default:
      throw new Error(
        `Unknown TELEPHONY_PROVIDER "${providerName}". No real provider is integrated yet — see docs/adr/dialect-feasibility-verdict.md.`,
      );
  }
}

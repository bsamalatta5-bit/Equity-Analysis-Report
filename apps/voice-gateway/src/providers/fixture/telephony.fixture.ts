import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import {
  THRESHOLDS,
  WebhookReplayDetectedError,
  WebhookSignatureInvalidError,
} from "@voice-receptionist/shared";
import { withTimeout } from "../../common/with-timeout";
import type { NonceStore } from "../nonce-store";
import type { TelephonyProvider } from "../telephony.provider";
import type { MediaSessionHandle, TelephonyWebhookRequest, VerifiedWebhookEvent } from "../types";

const PROVIDER_NAME = "fixture";
const TIMEOUT_MS = 5_000;

const SIGNATURE_HEADER = "x-webhook-signature";
const TIMESTAMP_HEADER = "x-webhook-timestamp";
const NONCE_HEADER = "x-webhook-nonce";

const webhookBodySchema = z.object({
  callReference: z.string().min(1),
  fromE164: z.string().min(1),
  toE164: z.string().min(1),
  eventType: z.enum(["call-start", "call-end"]),
});

function computeSignature(secret: string, rawBody: string): string {
  return createHmac("sha256", secret).update(rawBody, "utf-8").digest("hex");
}

function safeEqualHex(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, "hex");
  const bufferB = Buffer.from(b, "hex");
  if (bufferA.length !== bufferB.length) {
    return false;
  }
  return timingSafeEqual(bufferA, bufferB);
}

/**
 * A6.2: "fixture" in the sense that openMediaSession/transferCall/endCall
 * are stubbed (no real telephony vendor is selected yet — see
 * docs/adr/dialect-feasibility-verdict.md). verifyWebhook is NOT a stub:
 * A3.8/A5.1's HMAC-SHA256 + 300s replay window + single-use nonce scheme
 * is the spec's own vendor-agnostic contract, implemented for real here so
 * it is genuinely testable and reusable once a vendor is selected.
 */
export class FixtureTelephonyProvider implements TelephonyProvider {
  readonly providerName = PROVIDER_NAME;

  constructor(
    private readonly signingSecret: string,
    private readonly nonceStore: NonceStore,
  ) {}

  async verifyWebhook(request: TelephonyWebhookRequest): Promise<VerifiedWebhookEvent> {
    return withTimeout(this.doVerifyWebhook(request), TIMEOUT_MS, PROVIDER_NAME, "verifyWebhook");
  }

  private async doVerifyWebhook(request: TelephonyWebhookRequest): Promise<VerifiedWebhookEvent> {
    const signature = request.headers[SIGNATURE_HEADER];
    const timestampHeader = request.headers[TIMESTAMP_HEADER];
    const nonce = request.headers[NONCE_HEADER];

    if (!signature || !timestampHeader || !nonce) {
      throw new WebhookSignatureInvalidError();
    }

    const timestampSeconds = Number(timestampHeader);
    if (!Number.isFinite(timestampSeconds)) {
      throw new WebhookSignatureInvalidError();
    }
    const ageSeconds = Date.now() / 1000 - timestampSeconds;
    if (ageSeconds < 0 || ageSeconds > THRESHOLDS.TELEPHONY_WEBHOOK_REPLAY_WINDOW_SECONDS) {
      throw new WebhookSignatureInvalidError();
    }

    const expectedSignature = computeSignature(this.signingSecret, request.rawBody);
    let signatureValid: boolean;
    try {
      signatureValid = safeEqualHex(expectedSignature, signature);
    } catch {
      // Malformed (non-hex) signature header — a verification failure, not
      // a crash; Buffer.from on invalid hex throws, and that throw is the
      // "invalid signature" outcome, not an unhandled error.
      signatureValid = false;
    }
    if (!signatureValid) {
      throw new WebhookSignatureInvalidError();
    }

    const claimed = await this.nonceStore.claim(nonce, THRESHOLDS.TELEPHONY_WEBHOOK_REPLAY_WINDOW_SECONDS);
    if (!claimed) {
      throw new WebhookReplayDetectedError();
    }

    const parsed = webhookBodySchema.safeParse(JSON.parse(request.rawBody));
    if (!parsed.success) {
      throw new WebhookSignatureInvalidError();
    }

    return parsed.data;
  }

  async openMediaSession(callReference: string): Promise<MediaSessionHandle> {
    return withTimeout(this.doOpenMediaSession(callReference), TIMEOUT_MS, PROVIDER_NAME, "openMediaSession");
  }

  private async doOpenMediaSession(callReference: string): Promise<MediaSessionHandle> {
    return { callReference, mediaWebsocketUrl: `ws://fixture.invalid/media/${randomUUID()}` };
  }

  async transferCall(_callReference: string, _targetE164: string): Promise<void> {
    await withTimeout(Promise.resolve(), TIMEOUT_MS, PROVIDER_NAME, "transferCall");
  }

  async endCall(_callReference: string): Promise<void> {
    await withTimeout(Promise.resolve(), TIMEOUT_MS, PROVIDER_NAME, "endCall");
  }
}

export { computeSignature as computeFixtureWebhookSignature };

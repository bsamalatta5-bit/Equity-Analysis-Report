import { randomUUID } from "node:crypto";
import { WebhookReplayDetectedError, WebhookSignatureInvalidError } from "@voice-receptionist/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryNonceStore } from "../nonce-store";
import { FixtureTelephonyProvider, computeFixtureWebhookSignature } from "./telephony.fixture";

const SECRET = "test-signing-secret";

function buildRequest(overrides: {
  body?: string;
  timestampSeconds?: number;
  nonce?: string;
  signature?: string;
  omitHeaders?: readonly string[];
}) {
  const body =
    overrides.body ??
    JSON.stringify({
      callReference: "call-123",
      fromE164: "+966500000000",
      toE164: "+966115550100",
      eventType: "call-start",
    });
  const timestampSeconds = overrides.timestampSeconds ?? Math.floor(Date.now() / 1000);
  const nonce = overrides.nonce ?? randomUUID();
  const signature = overrides.signature ?? computeFixtureWebhookSignature(SECRET, body);

  const headers: Record<string, string> = {
    "x-webhook-signature": signature,
    "x-webhook-timestamp": String(timestampSeconds),
    "x-webhook-nonce": nonce,
  };
  for (const header of overrides.omitHeaders ?? []) {
    delete headers[header];
  }

  return { rawBody: body, headers };
}

describe("FixtureTelephonyProvider.verifyWebhook (A5.1)", () => {
  let provider: FixtureTelephonyProvider;

  beforeEach(() => {
    provider = new FixtureTelephonyProvider(SECRET, new InMemoryNonceStore());
  });

  it("accepts a correctly signed, fresh, unique-nonce request", async () => {
    const event = await provider.verifyWebhook(buildRequest({}));
    expect(event.callReference).toBe("call-123");
    expect(event.eventType).toBe("call-start");
  });

  it("rejects an invalid signature with WebhookSignatureInvalidError, no call record data returned", async () => {
    await expect(
      provider.verifyWebhook(buildRequest({ signature: "0".repeat(64) })),
    ).rejects.toBeInstanceOf(WebhookSignatureInvalidError);
  });

  it("rejects a signature computed over a different body (tamper detection)", async () => {
    const request = buildRequest({});
    const tampered = { ...request, rawBody: JSON.stringify({ ...JSON.parse(request.rawBody), toE164: "+966000000000" }) };
    await expect(provider.verifyWebhook(tampered)).rejects.toBeInstanceOf(WebhookSignatureInvalidError);
  });

  it("rejects a signature older than the 300s replay window", async () => {
    const staleTimestamp = Math.floor(Date.now() / 1000) - 301;
    const body = JSON.stringify({
      callReference: "call-123",
      fromE164: "+966500000000",
      toE164: "+966115550100",
      eventType: "call-start",
    });
    const signature = computeFixtureWebhookSignature(SECRET, body);
    await expect(
      provider.verifyWebhook(buildRequest({ body, timestampSeconds: staleTimestamp, signature })),
    ).rejects.toBeInstanceOf(WebhookSignatureInvalidError);
  });

  it("rejects a timestamp in the future beyond the replay window", async () => {
    const futureTimestamp = Math.floor(Date.now() / 1000) + 301;
    const body = JSON.stringify({
      callReference: "call-123",
      fromE164: "+966500000000",
      toE164: "+966115550100",
      eventType: "call-start",
    });
    const signature = computeFixtureWebhookSignature(SECRET, body);
    await expect(
      provider.verifyWebhook(buildRequest({ body, timestampSeconds: futureTimestamp, signature })),
    ).rejects.toBeInstanceOf(WebhookSignatureInvalidError);
  });

  it("rejects a replayed nonce on the second delivery, even with a valid signature both times", async () => {
    const request = buildRequest({});
    await provider.verifyWebhook(request);
    await expect(provider.verifyWebhook(request)).rejects.toBeInstanceOf(WebhookReplayDetectedError);
  });

  it("rejects a request missing the signature header", async () => {
    await expect(
      provider.verifyWebhook(buildRequest({ omitHeaders: ["x-webhook-signature"] })),
    ).rejects.toBeInstanceOf(WebhookSignatureInvalidError);
  });

  it("rejects a request missing the nonce header", async () => {
    await expect(
      provider.verifyWebhook(buildRequest({ omitHeaders: ["x-webhook-nonce"] })),
    ).rejects.toBeInstanceOf(WebhookSignatureInvalidError);
  });

  it("rejects a well-signed body that doesn't match the expected schema", async () => {
    const body = JSON.stringify({ nonsense: true });
    const signature = computeFixtureWebhookSignature(SECRET, body);
    await expect(provider.verifyWebhook(buildRequest({ body, signature }))).rejects.toBeInstanceOf(
      WebhookSignatureInvalidError,
    );
  });

  it("does not consume the nonce on a failed (bad-signature) verification attempt", async () => {
    const store = new InMemoryNonceStore();
    const failingProvider = new FixtureTelephonyProvider(SECRET, store);
    const nonce = randomUUID();

    await expect(
      failingProvider.verifyWebhook(buildRequest({ nonce, signature: "0".repeat(64) })),
    ).rejects.toBeInstanceOf(WebhookSignatureInvalidError);

    // Signature verification happens before the nonce is claimed, so the
    // same nonce, now correctly signed, still succeeds on retry.
    await expect(failingProvider.verifyWebhook(buildRequest({ nonce }))).resolves.toBeDefined();
  });
});

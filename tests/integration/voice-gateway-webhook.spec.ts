import { randomUUID } from "node:crypto";
import Redis from "ioredis";
import { PrismaClient } from "@prisma/client";
import { createLogger } from "@voice-receptionist/logger";
import { WebhookReplayDetectedError, WebhookSignatureInvalidError } from "@voice-receptionist/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { InMemoryNonceStore } from "../../apps/voice-gateway/src/providers/nonce-store";
import {
  FixtureTelephonyProvider,
  computeFixtureWebhookSignature,
} from "../../apps/voice-gateway/src/providers/fixture/telephony.fixture";
import { CallSessionStore } from "../../apps/voice-gateway/src/session/call-session-store";
import { TelephonyWebhookHandler } from "../../apps/voice-gateway/src/telephony/webhook-handler";
import { TelephonyWebhookRateLimiter } from "../../apps/voice-gateway/src/telephony/webhook-rate-limit";
import { migratorPrisma } from "./fixtures";

const SECRET = "test-webhook-secret";

function buildWebhookRequest(body: Record<string, unknown>, overrides: { nonce?: string; timestampSeconds?: number } = {}) {
  const rawBody = JSON.stringify(body);
  const timestampSeconds = overrides.timestampSeconds ?? Math.floor(Date.now() / 1000);
  const nonce = overrides.nonce ?? randomUUID();
  return {
    rawBody,
    headers: {
      "x-webhook-signature": computeFixtureWebhookSignature(SECRET, rawBody),
      "x-webhook-timestamp": String(timestampSeconds),
      "x-webhook-nonce": nonce,
    },
  };
}

describe("TelephonyWebhookHandler (Module 5 core)", () => {
  let voiceGatewayPrisma: PrismaClient;
  let redis: Redis;
  let handler: TelephonyWebhookHandler;
  let sessionStore: CallSessionStore;
  let tenantId: string;
  let locationId: string;
  let phoneNumberE164: string;

  beforeAll(async () => {
    voiceGatewayPrisma = new PrismaClient({ datasources: { db: { url: process.env["DATABASE_URL"]! } } });
    redis = new Redis(process.env["REDIS_URL"]!);

    const suffix = randomUUID().slice(0, 8);
    const tenant = await migratorPrisma.tenant.create({
      data: { legalName: `WG Test ${suffix}`, commercialRegistration: `CR-${suffix}`, status: "active", planCode: "test" },
    });
    const location = await migratorPrisma.location.create({
      data: { tenantId: tenant.id, name: "Main", addressLine: "x", timezone: "Asia/Riyadh", active: true },
    });
    phoneNumberE164 = `+9665${Math.floor(10000000 + Math.random() * 89999999)}`;
    await migratorPrisma.phoneNumber.create({
      data: { tenantId: tenant.id, locationId: location.id, e164Number: phoneNumberE164, providerReference: "test", status: "active" },
    });
    tenantId = tenant.id;
    locationId = location.id;

    sessionStore = new CallSessionStore(redis);
    const rateLimiter = new TelephonyWebhookRateLimiter(redis);
    const telephonyProvider = new FixtureTelephonyProvider(SECRET, new InMemoryNonceStore());
    handler = new TelephonyWebhookHandler(
      telephonyProvider,
      voiceGatewayPrisma,
      sessionStore,
      rateLimiter,
      createLogger({ serviceName: "test" }),
    );
  });

  afterAll(async () => {
    await voiceGatewayPrisma.$disconnect();
    await redis.quit();
  });

  it("A5.3: a valid call-start webhook creates a Call and a ConsentRecord before returning", async () => {
    const callReference = randomUUID();
    const request = buildWebhookRequest({
      callReference,
      fromE164: "+966500000001",
      toE164: phoneNumberE164,
      eventType: "call-start",
    });

    const result = await handler.handle(request, "203.0.113.10");

    const call = await migratorPrisma.call.findUniqueOrThrow({ where: { id: result.callId } });
    expect(call.tenantId).toBe(tenantId);
    expect(call.locationId).toBe(locationId);
    expect(call.endedAt).toBeNull();

    const consent = await migratorPrisma.consentRecord.findUniqueOrThrow({ where: { callId: result.callId } });
    expect(consent.recordingConsented).toBe(false);
    expect(consent.announcementPlayedAt).toBeNull();
  });

  it("A5.5: call-start initializes Redis session state keyed by callReference", async () => {
    const callReference = randomUUID();
    const request = buildWebhookRequest({
      callReference,
      fromE164: "+966500000002",
      toE164: phoneNumberE164,
      eventType: "call-start",
    });
    const result = await handler.handle(request, "203.0.113.10");

    const session = await sessionStore.get(callReference);
    expect(session?.callId).toBe(result.callId);
    expect(session?.tenantId).toBe(tenantId);
    expect(session?.turnSequence).toBe(0);
  });

  it("call-end sets endedAt and clears the session", async () => {
    const callReference = randomUUID();
    const startRequest = buildWebhookRequest({
      callReference,
      fromE164: "+966500000003",
      toE164: phoneNumberE164,
      eventType: "call-start",
    });
    const { callId } = await handler.handle(startRequest, "203.0.113.10");

    const endRequest = buildWebhookRequest({
      callReference,
      fromE164: "+966500000003",
      toE164: phoneNumberE164,
      eventType: "call-end",
    });
    await handler.handle(endRequest, "203.0.113.10");

    const call = await migratorPrisma.call.findUniqueOrThrow({ where: { id: callId } });
    expect(call.endedAt).not.toBeNull();
    expect(await sessionStore.get(callReference)).toBeNull();
  });

  it("A5.1: an invalid signature is rejected and creates no Call row", async () => {
    const callCountBefore = await migratorPrisma.call.count({ where: { tenantId } });

    const callReference = randomUUID();
    const request = buildWebhookRequest({
      callReference,
      fromE164: "+966500000004",
      toE164: phoneNumberE164,
      eventType: "call-start",
    });
    request.headers["x-webhook-signature"] = "0".repeat(64);

    await expect(handler.handle(request, "203.0.113.10")).rejects.toBeInstanceOf(WebhookSignatureInvalidError);

    const callCountAfter = await migratorPrisma.call.count({ where: { tenantId } });
    expect(callCountAfter).toBe(callCountBefore);
    // No call was created for this specific (unresolvable) callReference —
    // verified via session store, which is only ever populated on success.
    expect(await sessionStore.get(callReference)).toBeNull();
  });

  it("A5.1: a replayed nonce is rejected on the second delivery", async () => {
    const callReference = randomUUID();
    const nonce = randomUUID();
    const request = buildWebhookRequest(
      { callReference, fromE164: "+966500000005", toE164: phoneNumberE164, eventType: "call-start" },
      { nonce },
    );

    await handler.handle(request, "203.0.113.10");

    const replay = buildWebhookRequest(
      { callReference, fromE164: "+966500000005", toE164: phoneNumberE164, eventType: "call-start" },
      { nonce },
    );
    replay.headers["x-webhook-nonce"] = nonce;
    await expect(handler.handle(replay, "203.0.113.10")).rejects.toBeInstanceOf(WebhookReplayDetectedError);
  });

  it("rejects a call for an unknown/inactive phone number without creating any record", async () => {
    const callReference = randomUUID();
    const request = buildWebhookRequest({
      callReference,
      fromE164: "+966500000006",
      toE164: "+966599999999",
      eventType: "call-start",
    });
    await expect(handler.handle(request, "203.0.113.10")).rejects.toThrow();
    expect(await sessionStore.get(callReference)).toBeNull();
  });
});

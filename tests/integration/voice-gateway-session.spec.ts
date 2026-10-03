import { randomUUID } from "node:crypto";
import Redis from "ioredis";
import { afterAll, describe, expect, it } from "vitest";
import { CallSessionStore } from "../../apps/voice-gateway/src/session/call-session-store";

const redis = new Redis(process.env["REDIS_URL"]!);

describe("CallSessionStore (A5.5)", () => {
  afterAll(async () => {
    await redis.quit();
  });

  it("round-trips session state through Redis", async () => {
    const store = new CallSessionStore(redis);
    const callReference = randomUUID();
    const state = {
      callId: randomUUID(),
      tenantId: randomUUID(),
      locationId: randomUUID(),
      contactPhoneE164: "+966500000000",
      turnSequence: 0,
      detectedLanguage: null,
    };

    await store.create(callReference, state);
    const fetched = await store.get(callReference);
    expect(fetched).toEqual(state);
  });

  it("increments the turn sequence", async () => {
    const store = new CallSessionStore(redis);
    const callReference = randomUUID();
    await store.create(callReference, {
      callId: randomUUID(),
      tenantId: randomUUID(),
      locationId: randomUUID(),
      contactPhoneE164: null,
      turnSequence: 0,
      detectedLanguage: null,
    });

    expect(await store.incrementTurnSequence(callReference)).toBe(1);
    expect(await store.incrementTurnSequence(callReference)).toBe(2);
    expect((await store.get(callReference))?.turnSequence).toBe(2);
  });

  it("updates arbitrary fields via update()", async () => {
    const store = new CallSessionStore(redis);
    const callReference = randomUUID();
    await store.create(callReference, {
      callId: randomUUID(),
      tenantId: randomUUID(),
      locationId: randomUUID(),
      contactPhoneE164: null,
      turnSequence: 0,
      detectedLanguage: null,
    });

    await store.update(callReference, { detectedLanguage: "ar" });
    expect((await store.get(callReference))?.detectedLanguage).toBe("ar");
  });

  it("returns null for an unknown call reference", async () => {
    const store = new CallSessionStore(redis);
    expect(await store.get(randomUUID())).toBeNull();
  });

  it("A5.5: state survives a simulated gateway restart — a second, independent store instance reads what the first wrote", async () => {
    const instanceBeforeRestart = new CallSessionStore(redis);
    const callReference = randomUUID();
    const state = {
      callId: randomUUID(),
      tenantId: randomUUID(),
      locationId: randomUUID(),
      contactPhoneE164: "+966511111111",
      turnSequence: 3,
      detectedLanguage: "en" as const,
    };
    await instanceBeforeRestart.create(callReference, state);

    // Nothing about the process or this store instance carries over —
    // only the Redis connection, standing in for "the gateway process
    // restarted and reconnected to the same Redis."
    const instanceAfterRestart = new CallSessionStore(new Redis(process.env["REDIS_URL"]!));
    const resumed = await instanceAfterRestart.get(callReference);
    expect(resumed).toEqual(state);
  });

  it("deletes session state", async () => {
    const store = new CallSessionStore(redis);
    const callReference = randomUUID();
    await store.create(callReference, {
      callId: randomUUID(),
      tenantId: randomUUID(),
      locationId: randomUUID(),
      contactPhoneE164: null,
      turnSequence: 0,
      detectedLanguage: null,
    });
    await store.delete(callReference);
    expect(await store.get(callReference)).toBeNull();
  });
});

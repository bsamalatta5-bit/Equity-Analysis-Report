import type { Redis } from "ioredis";
import { z } from "zod";
import { KNOWLEDGE_LANGUAGE } from "@voice-receptionist/shared";

export const callSessionStateSchema = z.object({
  callId: z.string().uuid(),
  tenantId: z.string().uuid(),
  locationId: z.string().uuid(),
  contactPhoneE164: z.string().nullable(),
  turnSequence: z.number().int().nonnegative(),
  detectedLanguage: z.enum(KNOWLEDGE_LANGUAGE).nullable(),
});
export type CallSessionState = z.infer<typeof callSessionStateSchema>;

const DEFAULT_TTL_SECONDS = 4 * 60 * 60; // longer than any plausible single call

function sessionKey(callReference: string): string {
  return `call-session:${callReference}`;
}

function activeCallsKey(tenantId: string): string {
  return `active-calls:${tenantId}`;
}

/**
 * A5.5: "Session state survives a gateway process restart within a live
 * call." All state lives in Redis, never in this process's memory, so any
 * gateway instance — including one that just restarted — can resume a
 * call by its callReference alone. See
 * call-session-store.spec.ts for a test that proves this by reading a
 * session back through a second, independent store instance sharing only
 * the Redis connection, standing in for a restarted process.
 */
export class CallSessionStore {
  constructor(
    private readonly redis: Redis,
    private readonly ttlSeconds: number = DEFAULT_TTL_SECONDS,
  ) {}

  /**
   * A11.2: also records this call in its tenant's active-call set, so
   * countActiveForTenant() can enforce the concurrent call ceiling without
   * scanning every session key. The set's own TTL is refreshed on every
   * create() (SADD doesn't reset TTL on its own); EXPIRE bounds how long a
   * crashed process's stale entry can inflate the count to at most
   * ttlSeconds — the same bound an orphaned session key is already
   * subject to.
   */
  async create(callReference: string, state: CallSessionState): Promise<void> {
    const multi = this.redis.multi();
    multi.set(sessionKey(callReference), JSON.stringify(state), "EX", this.ttlSeconds);
    multi.sadd(activeCallsKey(state.tenantId), callReference);
    multi.expire(activeCallsKey(state.tenantId), this.ttlSeconds);
    await multi.exec();
  }

  async countActiveForTenant(tenantId: string): Promise<number> {
    return this.redis.scard(activeCallsKey(tenantId));
  }

  async get(callReference: string): Promise<CallSessionState | null> {
    const raw = await this.redis.get(sessionKey(callReference));
    if (!raw) {
      return null;
    }
    const parsed = callSessionStateSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  }

  async update(callReference: string, patch: Partial<CallSessionState>): Promise<CallSessionState> {
    const existing = await this.get(callReference);
    if (!existing) {
      throw new Error(`No session state for call ${callReference}.`);
    }
    const next = { ...existing, ...patch };
    await this.create(callReference, next);
    return next;
  }

  async incrementTurnSequence(callReference: string): Promise<number> {
    const existing = await this.get(callReference);
    if (!existing) {
      throw new Error(`No session state for call ${callReference}.`);
    }
    const next = existing.turnSequence + 1;
    await this.update(callReference, { turnSequence: next });
    return next;
  }

  async delete(callReference: string): Promise<void> {
    const existing = await this.get(callReference);
    await this.redis.del(sessionKey(callReference));
    if (existing) {
      await this.redis.srem(activeCallsKey(existing.tenantId), callReference);
    }
  }
}

import type { Redis } from "ioredis";
import { RateLimitedError } from "@voice-receptionist/shared";

const PER_ADDRESS_LIMIT = 600;
const PER_ADDRESS_WINDOW_SECONDS = 60;
const PER_NUMBER_CALL_START_LIMIT = 60;
const PER_NUMBER_CALL_START_WINDOW_SECONDS = 60;

/** A3.8: telephony webhook rate limits — 600 req/min per source address, 60 call-start events/min per number. */
export class TelephonyWebhookRateLimiter {
  constructor(private readonly redis: Redis) {}

  async checkSourceAddress(sourceAddress: string): Promise<void> {
    await this.checkAndIncrement(`webhook-rate-limit:addr:${sourceAddress}`, PER_ADDRESS_LIMIT, PER_ADDRESS_WINDOW_SECONDS);
  }

  async checkCallStartForNumber(toE164: string): Promise<void> {
    await this.checkAndIncrement(
      `webhook-rate-limit:call-start:${toE164}`,
      PER_NUMBER_CALL_START_LIMIT,
      PER_NUMBER_CALL_START_WINDOW_SECONDS,
    );
  }

  private async checkAndIncrement(key: string, limit: number, windowSeconds: number): Promise<void> {
    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, windowSeconds);
    }
    if (count > limit) {
      const ttl = await this.redis.ttl(key);
      throw new RateLimitedError(ttl > 0 ? ttl : windowSeconds);
    }
  }
}

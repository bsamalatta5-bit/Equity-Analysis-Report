import { Inject, Injectable } from "@nestjs/common";
import type { Redis } from "ioredis";
import { RateLimitedError, THRESHOLDS } from "@voice-receptionist/shared";
import { REDIS_CLIENT } from "../common/redis/redis.module";

/**
 * A3.5: authentication endpoints are rate limited to
 * THRESHOLDS.AUTH_RATE_LIMIT_ATTEMPTS attempts per
 * THRESHOLDS.AUTH_RATE_LIMIT_WINDOW_SECONDS, per source address AND per
 * account. Account-level lockout (User.failedAttempts/lockedUntil) is
 * handled separately in SessionService once the account is known; this
 * service covers the address-level limit, which applies even before an
 * email is known to exist.
 */
@Injectable()
export class AuthRateLimitService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async checkAndIncrement(key: string): Promise<void> {
    const redisKey = `auth-rate-limit:${key}`;
    const count = await this.redis.incr(redisKey);
    if (count === 1) {
      await this.redis.expire(redisKey, THRESHOLDS.AUTH_RATE_LIMIT_WINDOW_SECONDS);
    }
    if (count > THRESHOLDS.AUTH_RATE_LIMIT_ATTEMPTS) {
      const ttl = await this.redis.ttl(redisKey);
      throw new RateLimitedError(ttl > 0 ? ttl : THRESHOLDS.AUTH_RATE_LIMIT_WINDOW_SECONDS);
    }
  }

  async reset(key: string): Promise<void> {
    await this.redis.del(`auth-rate-limit:${key}`);
  }
}

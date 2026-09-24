import type { Redis } from "ioredis";
import type { NonceStore } from "../providers/nonce-store";

/** Real deployments use this: SET ... NX makes the claim atomic across concurrent requests and gateway instances. */
export class RedisNonceStore implements NonceStore {
  constructor(private readonly redis: Redis) {}

  async claim(nonce: string, ttlSeconds: number): Promise<boolean> {
    const result = await this.redis.set(`webhook-nonce:${nonce}`, "1", "EX", ttlSeconds, "NX");
    return result === "OK";
  }
}

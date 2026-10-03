/**
 * A3.8/A5.1: the telephony webhook's single-use-nonce replay defense.
 * `claim` must be atomic — two concurrent requests with the same nonce
 * must not both succeed.
 */
export interface NonceStore {
  /** Returns true if this nonce was not previously claimed (and is now claimed); false if it was already seen. */
  claim(nonce: string, ttlSeconds: number): Promise<boolean>;
}

/** Test-only: real deployments use RedisNonceStore (apps/voice-gateway/src/telephony) so claims survive a process restart. */
export class InMemoryNonceStore implements NonceStore {
  private readonly seen = new Map<string, number>();

  async claim(nonce: string, ttlSeconds: number): Promise<boolean> {
    this.sweep();
    if (this.seen.has(nonce)) {
      return false;
    }
    this.seen.set(nonce, Date.now() + ttlSeconds * 1000);
    return true;
  }

  private sweep(): void {
    const now = Date.now();
    for (const [nonce, expiresAt] of this.seen) {
      if (expiresAt <= now) {
        this.seen.delete(nonce);
      }
    }
  }
}

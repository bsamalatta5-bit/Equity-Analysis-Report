import { describe, expect, it } from "vitest";
import { InMemoryNonceStore } from "./nonce-store";

describe("InMemoryNonceStore", () => {
  it("claims a fresh nonce", async () => {
    const store = new InMemoryNonceStore();
    expect(await store.claim("n1", 300)).toBe(true);
  });

  it("refuses to claim the same nonce twice (A5.1 replay defense)", async () => {
    const store = new InMemoryNonceStore();
    expect(await store.claim("n1", 300)).toBe(true);
    expect(await store.claim("n1", 300)).toBe(false);
  });

  it("treats different nonces independently", async () => {
    const store = new InMemoryNonceStore();
    expect(await store.claim("n1", 300)).toBe(true);
    expect(await store.claim("n2", 300)).toBe(true);
  });
});

import { ProviderFailureError, ProviderTimeoutError } from "@voice-receptionist/shared";
import { describe, expect, it } from "vitest";
import { withTimeout } from "./with-timeout";

describe("withTimeout", () => {
  it("resolves with the operation's value when it completes before the timeout", async () => {
    const result = await withTimeout(Promise.resolve("ok"), 1_000, "test-provider", "op");
    expect(result).toBe("ok");
  });

  it("throws ProviderTimeoutError when the operation does not settle in time", async () => {
    const neverSettles = new Promise<never>(() => {});
    await expect(withTimeout(neverSettles, 10, "test-provider", "op")).rejects.toThrow(ProviderTimeoutError);
  });

  it("wraps a rejected operation in ProviderFailureError, preserving the cause", async () => {
    const original = new Error("boom");
    await expect(withTimeout(Promise.reject(original), 1_000, "test-provider", "op")).rejects.toBeInstanceOf(
      ProviderFailureError,
    );
    try {
      await withTimeout(Promise.reject(original), 1_000, "test-provider", "op");
      expect.unreachable();
    } catch (error) {
      expect((error as ProviderFailureError).cause).toBe(original);
    }
  });

  it("does not double-wrap an operation that already rejects with a ProviderTimeoutError", async () => {
    const alreadyTimedOut = Promise.reject(new ProviderTimeoutError("test-provider", "op"));
    await expect(withTimeout(alreadyTimedOut, 1_000, "test-provider", "op")).rejects.toBeInstanceOf(
      ProviderTimeoutError,
    );
  });
});

import { describe, expect, it } from "vitest";
import { en } from "./messages/en";
import { ar } from "./messages/ar";
import { resolveMessage } from "./message-path";

describe("resolveMessage", () => {
  it("resolves a nested dotted path for both catalogs", () => {
    expect(resolveMessage(en, "auth.signInTitle")).toBe("Sign in");
    expect(resolveMessage(ar, "auth.signInTitle")).toBe("تسجيل الدخول");
  });

  it("resolves a top-level namespace key", () => {
    expect(resolveMessage(en, "common.appName")).toBe("Voice Receptionist");
  });

  it("throws for a path that doesn't resolve to a string", () => {
    // @ts-expect-error — intentionally an invalid path to exercise the runtime guard.
    expect(() => resolveMessage(en, "auth")).toThrow(/Missing message/);
  });

  it("throws for a completely unknown path", () => {
    // @ts-expect-error — intentionally an invalid path to exercise the runtime guard.
    expect(() => resolveMessage(en, "nope.nope")).toThrow(/Missing message/);
  });
});

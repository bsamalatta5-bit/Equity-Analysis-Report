import { describe, expect, it } from "vitest";
import { maskPhoneE164 } from "./phone";

describe("maskPhoneE164", () => {
  it("masks every digit except the last 4", () => {
    expect(maskPhoneE164("+966501234567")).toBe("•••••••••4567");
  });

  it("leaves a short string unmasked rather than producing a negative repeat count", () => {
    expect(maskPhoneE164("123")).toBe("123");
  });
});

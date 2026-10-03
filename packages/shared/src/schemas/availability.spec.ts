import { describe, expect, it } from "vitest";
import { createAvailabilityRuleRequestSchema, createBlockedPeriodRequestSchema } from "./availability";

describe("createAvailabilityRuleRequestSchema", () => {
  const base = {
    staffMemberId: "11111111-1111-1111-1111-111111111111",
    weekday: 0,
    effectiveFrom: "2026-01-01",
  };

  it("accepts a valid rule", () => {
    const result = createAvailabilityRuleRequestSchema.safeParse({
      ...base,
      startTime: "09:00",
      endTime: "17:00",
    });
    expect(result.success).toBe(true);
  });

  it("rejects startTime >= endTime", () => {
    const result = createAvailabilityRuleRequestSchema.safeParse({
      ...base,
      startTime: "17:00",
      endTime: "09:00",
    });
    expect(result.success).toBe(false);
  });

  it("rejects effectiveTo before effectiveFrom", () => {
    const result = createAvailabilityRuleRequestSchema.safeParse({
      ...base,
      startTime: "09:00",
      endTime: "17:00",
      effectiveTo: "2025-01-01",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a weekday outside 0-6", () => {
    const result = createAvailabilityRuleRequestSchema.safeParse({
      ...base,
      weekday: 7,
      startTime: "09:00",
      endTime: "17:00",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a malformed time string", () => {
    const result = createAvailabilityRuleRequestSchema.safeParse({
      ...base,
      startTime: "9am",
      endTime: "17:00",
    });
    expect(result.success).toBe(false);
  });
});

describe("createBlockedPeriodRequestSchema", () => {
  it("rejects endAt before startAt", () => {
    const result = createBlockedPeriodRequestSchema.safeParse({
      staffMemberId: "11111111-1111-1111-1111-111111111111",
      startAt: "2026-01-02T00:00:00.000Z",
      endAt: "2026-01-01T00:00:00.000Z",
      reason: "test",
    });
    expect(result.success).toBe(false);
  });
});

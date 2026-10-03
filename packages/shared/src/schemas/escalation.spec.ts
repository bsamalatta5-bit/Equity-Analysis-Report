import { describe, expect, it } from "vitest";
import { isTimeWithinActiveHours, type EscalationActiveHours } from "./escalation";

const businessHours: EscalationActiveHours = {
  windows: [
    { weekday: 0, startTime: "09:00", endTime: "17:00" },
    { weekday: 1, startTime: "09:00", endTime: "17:00" },
  ],
};

describe("isTimeWithinActiveHours (A9.5)", () => {
  it("is true inside a matching window", () => {
    expect(isTimeWithinActiveHours(businessHours, 0, "12:00")).toBe(true);
  });

  it("is true at the exact start boundary and false at the exact end boundary", () => {
    expect(isTimeWithinActiveHours(businessHours, 0, "09:00")).toBe(true);
    expect(isTimeWithinActiveHours(businessHours, 0, "17:00")).toBe(false);
  });

  it("is false on a weekday with no configured window", () => {
    expect(isTimeWithinActiveHours(businessHours, 2, "12:00")).toBe(false);
  });

  it("is false before or after the window on a matching weekday", () => {
    expect(isTimeWithinActiveHours(businessHours, 1, "08:59")).toBe(false);
    expect(isTimeWithinActiveHours(businessHours, 1, "17:01")).toBe(false);
  });

  it("is false when no windows are configured at all", () => {
    expect(isTimeWithinActiveHours({ windows: [] }, 0, "12:00")).toBe(false);
  });
});

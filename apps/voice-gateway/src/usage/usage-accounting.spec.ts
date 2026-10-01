import { describe, expect, it } from "vitest";
import { computeBillableMinutes, periodStartFor } from "./usage-accounting";

describe("computeBillableMinutes (A11.1)", () => {
  it("rounds up to the next whole minute", () => {
    const startedAt = new Date("2030-01-01T00:00:00.000Z");
    expect(computeBillableMinutes(startedAt, new Date("2030-01-01T00:01:01.000Z"))).toBe(2);
  });

  it("bills exactly one minute for an exact one-minute call", () => {
    const startedAt = new Date("2030-01-01T00:00:00.000Z");
    expect(computeBillableMinutes(startedAt, new Date("2030-01-01T00:01:00.000Z"))).toBe(1);
  });

  it("bills at least one minute even for a near-instant call", () => {
    const startedAt = new Date("2030-01-01T00:00:00.000Z");
    expect(computeBillableMinutes(startedAt, new Date("2030-01-01T00:00:01.000Z"))).toBe(1);
    expect(computeBillableMinutes(startedAt, startedAt)).toBe(1);
  });

  it("never returns a negative duration for a clock anomaly (endedAt before startedAt)", () => {
    const startedAt = new Date("2030-01-01T00:01:00.000Z");
    const endedAt = new Date("2030-01-01T00:00:00.000Z");
    expect(computeBillableMinutes(startedAt, endedAt)).toBe(1);
  });
});

describe("periodStartFor", () => {
  it("returns the first instant of the UTC calendar month", () => {
    expect(periodStartFor(new Date("2030-03-17T13:45:00.000Z")).toISOString()).toBe(
      "2030-03-01T00:00:00.000Z",
    );
  });

  it("is stable at the exact start of a month", () => {
    expect(periodStartFor(new Date("2030-03-01T00:00:00.000Z")).toISOString()).toBe(
      "2030-03-01T00:00:00.000Z",
    );
  });
});

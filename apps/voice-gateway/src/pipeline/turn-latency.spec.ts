import { describe, expect, it } from "vitest";
import { computeP95, TurnLatencyRecorder } from "./turn-latency";

describe("TurnLatencyRecorder", () => {
  it("measures a non-negative elapsed duration", async () => {
    const recorder = new TurnLatencyRecorder();
    recorder.start();
    await new Promise((resolve) => setTimeout(resolve, 5));
    const elapsed = recorder.stop();
    expect(elapsed).toBeGreaterThanOrEqual(0);
  });

  it("throws when stop() is called without a matching start()", () => {
    const recorder = new TurnLatencyRecorder();
    expect(() => recorder.stop()).toThrow();
  });

  it("can be reused for a second turn after stop()", async () => {
    const recorder = new TurnLatencyRecorder();
    recorder.start();
    recorder.stop();
    recorder.start();
    expect(recorder.stop()).toBeGreaterThanOrEqual(0);
  });
});

describe("computeP95", () => {
  it("returns the value at the 95th percentile", () => {
    const values = Array.from({ length: 100 }, (_, i) => i + 1); // 1..100
    // 95th percentile of a 1..100 sorted array at index floor(100*0.95)=95 -> value 96
    expect(computeP95(values)).toBe(96);
  });

  it("returns the only value for a single-sample input", () => {
    expect(computeP95([42])).toBe(42);
  });

  it("is insensitive to input order", () => {
    const ascending = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const shuffled = [7, 2, 9, 1, 5, 10, 3, 8, 4, 6];
    expect(computeP95(shuffled)).toBe(computeP95(ascending));
  });

  it("throws on an empty array", () => {
    expect(() => computeP95([])).toThrow();
  });
});

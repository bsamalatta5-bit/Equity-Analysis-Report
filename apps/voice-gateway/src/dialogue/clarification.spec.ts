import { describe, expect, it } from "vitest";
import { evaluateConfidence } from "./clarification";

describe("evaluateConfidence (A7.2)", () => {
  it("accepts a confidence at or above 0.65 and resets the counter", () => {
    expect(evaluateConfidence(0.65, 1)).toEqual({ outcome: "accept", nextConsecutiveLowConfidenceCount: 0 });
    expect(evaluateConfidence(0.9, 0)).toEqual({ outcome: "accept", nextConsecutiveLowConfidenceCount: 0 });
  });

  it("clarifies on the first low-confidence result", () => {
    expect(evaluateConfidence(0.5, 0)).toEqual({ outcome: "clarify", nextConsecutiveLowConfidenceCount: 1 });
  });

  it("clarifies on the second consecutive low-confidence result", () => {
    expect(evaluateConfidence(0.4, 1)).toEqual({ outcome: "clarify", nextConsecutiveLowConfidenceCount: 2 });
  });

  it("escalates on a third consecutive low-confidence result — the max of two clarifications is exhausted", () => {
    expect(evaluateConfidence(0.3, 2)).toEqual({ outcome: "escalate", nextConsecutiveLowConfidenceCount: 3 });
  });

  it("a low-confidence result right after an accepted one starts the count fresh at 1", () => {
    const afterAccept = evaluateConfidence(0.9, 5); // prior count irrelevant once accepted
    expect(afterAccept.nextConsecutiveLowConfidenceCount).toBe(0);
    expect(evaluateConfidence(0.3, afterAccept.nextConsecutiveLowConfidenceCount).outcome).toBe("clarify");
  });
});

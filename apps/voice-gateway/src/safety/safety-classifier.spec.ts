import { describe, expect, it } from "vitest";
import { classifySafety } from "./safety-classifier";

describe("classifySafety (A9.1)", () => {
  it.each([
    "I'm having chest pain and I can't breathe",
    "My father is unconscious and unresponsive",
    "There's severe bleeding and it won't stop",
    "I think I'm having a stroke, my face is drooping",
    "أعاني من نزيف شديد ولا أستطيع التنفس",
    "هذه حالة طارئة، أبي فاقد الوعي",
  ])("flags an emergency phrase: %s", (text) => {
    const result = classifySafety(text);
    expect(result.flagged).toBe(true);
    expect(result.category).toBe("emergency");
  });

  it.each([
    "What medication should I take for this rash?",
    "Do I have diabetes based on these symptoms?",
    "وش الدواء المناسب لهذا الألم؟",
  ])("flags a clinical request: %s", (text) => {
    const result = classifySafety(text);
    expect(result.flagged).toBe(true);
    expect(result.category).toBe("clinical");
  });

  it.each([
    "I'd like to book a dental cleaning for next week",
    "What are your opening hours?",
    "Can I speak to a human please?",
    "أبغى أحجز موعد بكرة",
    "serviceId:svc-1 staffMemberId:staff-1 requestedStartAt:2030-01-01T09:00:00.000Z",
    "yes, confirm:yes",
  ])("does not flag an ordinary booking/knowledge turn: %s", (text) => {
    const result = classifySafety(text);
    expect(result.flagged).toBe(false);
    expect(result.category).toBeNull();
  });
});

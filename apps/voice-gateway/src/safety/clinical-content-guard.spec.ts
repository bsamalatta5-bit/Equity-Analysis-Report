import { describe, expect, it } from "vitest";
import { containsClinicalContent } from "./clinical-content-guard";

describe("containsClinicalContent (A9.4)", () => {
  it.each([
    "You have diabetes based on those symptoms.",
    "Take 400 mg of ibuprofen every 6 hours.",
    "The diagnosis is a mild concussion.",
    "You should take antibiotics for that infection.",
    "يعاني من عدوى بسيطة.",
    "التشخيص هو التهاب في الحلق.",
  ])("flags clinical output: %s", (text) => {
    expect(containsClinicalContent(text)).toBe(true);
  });

  it.each([
    "We are open Sunday to Thursday, 9 AM to 5 PM.",
    "Teeth whitening costs 450 SAR.",
    "Your appointment is confirmed. Thank you for calling, goodbye.",
    "I don't have an answer for that. Let me connect you with a member of our team.",
  ])("does not flag ordinary business-information output: %s", (text) => {
    expect(containsClinicalContent(text)).toBe(false);
  });
});

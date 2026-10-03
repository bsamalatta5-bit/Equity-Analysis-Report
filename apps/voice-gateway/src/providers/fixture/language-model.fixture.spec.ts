import { describe, expect, it } from "vitest";
import { FixtureLanguageModelProvider } from "./language-model.fixture";

const provider = new FixtureLanguageModelProvider();

describe("FixtureLanguageModelProvider.classifyIntent", () => {
  it("classifies an Arabic booking request", async () => {
    const result = await provider.classifyIntent({
      callerUtterance: "أبغى أحجز موعد بكرة",
      conversationHistory: [],
      language: "ar",
    });
    expect(result.intent).toBe("book_appointment");
  });

  it("classifies a cancellation request", async () => {
    const result = await provider.classifyIntent({
      callerUtterance: "I want to cancel my appointment",
      conversationHistory: [],
      language: "en",
    });
    expect(result.intent).toBe("cancel_appointment");
  });

  it("classifies a request to speak to a human", async () => {
    const result = await provider.classifyIntent({
      callerUtterance: "can I talk to a human please",
      conversationHistory: [],
      language: "en",
    });
    expect(result.intent).toBe("request_human");
  });

  it("falls back to unknown with low confidence", async () => {
    const result = await provider.classifyIntent({
      callerUtterance: "the weather is nice today",
      conversationHistory: [],
      language: "en",
    });
    expect(result.intent).toBe("unknown");
    expect(result.confidence).toBeLessThan(0.5);
  });

  it("classifies a business-information question by its question mark", async () => {
    const result = await provider.classifyIntent({
      callerUtterance: "What are your opening hours?",
      conversationHistory: [],
      language: "en",
    });
    expect(result.intent).toBe("ask_question");
  });

  it("no longer classifies an 'emergency' intent — Module 9's safety classifier owns that detection now", async () => {
    const result = await provider.classifyIntent({
      callerUtterance: "I'm having chest pain, this is an emergency",
      conversationHistory: [],
      language: "en",
    });
    expect(result.intent).not.toBe("emergency");
  });
});

describe("FixtureLanguageModelProvider.extractSlots", () => {
  it("extracts embedded slotName:value tokens at high confidence", async () => {
    const result = await provider.extractSlots({
      callerUtterance: "book serviceId:svc-1 staffMemberId:staff-1",
      conversationHistory: [],
      language: "en",
      slotNames: ["serviceId", "staffMemberId", "requestedStartAt"],
    });
    expect(result.slots["serviceId"]).toBe("svc-1");
    expect(result.slots["staffMemberId"]).toBe("staff-1");
    expect(result.slots["requestedStartAt"]).toBeUndefined();
    expect(result.confidencePerSlot["serviceId"]).toBeGreaterThanOrEqual(0.65);
    expect(result.confidencePerSlot["requestedStartAt"]).toBeLessThan(0.65);
  });

  it("returns undefined/low confidence for every slot when nothing is embedded", async () => {
    const result = await provider.extractSlots({
      callerUtterance: "I'd like an appointment sometime soon",
      conversationHistory: [],
      language: "en",
      slotNames: ["serviceId"],
    });
    expect(result.slots["serviceId"]).toBeUndefined();
    expect(result.confidencePerSlot["serviceId"]).toBeLessThan(0.65);
  });
});

describe("FixtureLanguageModelProvider.draftGroundedResponse (Constraint 2.2)", () => {
  it("states the answer is unavailable when no knowledge was retrieved, rather than inventing one", async () => {
    const result = await provider.draftGroundedResponse({
      callerUtterance: "what are your prices",
      conversationHistory: [],
      language: "en",
      retrievedKnowledge: [],
    });
    expect(result.groundedInRetrievedKnowledge).toBe(false);
    expect(result.responseText.toLowerCase()).toContain("don't have an answer");
  });

  it("returns only the retrieved answer text when knowledge was retrieved", async () => {
    const result = await provider.draftGroundedResponse({
      callerUtterance: "what are your hours",
      conversationHistory: [],
      language: "en",
      retrievedKnowledge: [{ questionText: "hours?", answerText: "9 to 5, Sunday to Thursday." }],
    });
    expect(result.groundedInRetrievedKnowledge).toBe(true);
    expect(result.responseText).toBe("9 to 5, Sunday to Thursday.");
  });
});

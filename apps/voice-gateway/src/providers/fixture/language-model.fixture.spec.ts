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

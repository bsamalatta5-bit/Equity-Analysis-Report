import { describe, expect, it } from "vitest";
import { summarizeVoiceRatings, type ListenerRating } from "./rating";

function makeRatings(voiceId: string, listenerCount: number, score: number): ListenerRating[] {
  return Array.from({ length: listenerCount }, (_, i) => ({
    listenerId: `listener-${i}`,
    voiceId,
    score,
  }));
}

describe("summarizeVoiceRatings", () => {
  it("computes the mean score per voice", () => {
    const ratings = [...makeRatings("voice-a", 20, 4), ...makeRatings("voice-b", 20, 2)];
    const summaries = summarizeVoiceRatings(ratings);
    expect(summaries.find((s) => s.voiceId === "voice-a")?.meanScore).toBe(4);
    expect(summaries.find((s) => s.voiceId === "voice-b")?.meanScore).toBe(2);
  });

  it("sorts voices best (highest mean) first", () => {
    const ratings = [...makeRatings("low", 20, 2), ...makeRatings("high", 20, 5)];
    const summaries = summarizeVoiceRatings(ratings);
    expect(summaries.map((s) => s.voiceId)).toEqual(["high", "low"]);
  });

  it("A1.3: throws when a voice has fewer than 20 distinct listeners (enforced by default)", () => {
    const ratings = makeRatings("voice-a", 5, 4);
    expect(() => summarizeVoiceRatings(ratings)).toThrow(/20 listeners/);
  });

  it("does not enforce listener count when explicitly disabled (fixture/placeholder data)", () => {
    const ratings = makeRatings("voice-a", 3, 4);
    expect(() => summarizeVoiceRatings(ratings, { enforceListenerCount: false })).not.toThrow();
  });

  it("counts each listener once even if they somehow appear twice in the input", () => {
    const ratings: ListenerRating[] = [
      { listenerId: "l1", voiceId: "voice-a", score: 3 },
      { listenerId: "l1", voiceId: "voice-a", score: 5 },
    ];
    const [summary] = summarizeVoiceRatings(ratings, { enforceListenerCount: false });
    expect(summary?.listenerCount).toBe(1);
    expect(summary?.meanScore).toBe(4);
  });
});

import { describe, expect, it } from "vitest";
import { FixtureSpeechRecognitionProvider } from "./speech-recognition.fixture";

describe("FixtureSpeechRecognitionProvider", () => {
  it("emits the scripted partials then the final result when audio is pushed", async () => {
    const provider = new FixtureSpeechRecognitionProvider([
      {
        partials: [{ text: "أبغى", confidence: 0.5, detectedLanguage: "ar" }],
        final: { text: "أبغى أحجز موعد", confidence: 0.95, detectedLanguage: "ar" },
      },
    ]);

    const stream = await provider.openStream({ sampleRateHz: 8000 });
    const partials: string[] = [];
    let final: string | undefined;
    stream.onPartial((r) => partials.push(r.text));
    stream.onFinal((r) => {
      final = r.text;
    });

    await stream.pushAudio(Buffer.alloc(0));

    expect(partials).toEqual(["أبغى"]);
    expect(final).toBe("أبغى أحجز موعد");
  });

  it("consumes one script per call to openStream, in order", async () => {
    const provider = new FixtureSpeechRecognitionProvider([
      { final: { text: "first", confidence: 1, detectedLanguage: "en" } },
      { final: { text: "second", confidence: 1, detectedLanguage: "en" } },
    ]);

    const streamA = await provider.openStream({ sampleRateHz: 8000 });
    const streamB = await provider.openStream({ sampleRateHz: 8000 });

    let resultA: string | undefined;
    let resultB: string | undefined;
    streamA.onFinal((r) => (resultA = r.text));
    streamB.onFinal((r) => (resultB = r.text));
    await streamA.pushAudio(Buffer.alloc(0));
    await streamB.pushAudio(Buffer.alloc(0));

    expect(resultA).toBe("first");
    expect(resultB).toBe("second");
  });

  it("rejects pushAudio after close", async () => {
    const provider = new FixtureSpeechRecognitionProvider();
    const stream = await provider.openStream({ sampleRateHz: 8000 });
    await stream.close();
    await expect(stream.pushAudio(Buffer.alloc(0))).rejects.toThrow();
  });
});

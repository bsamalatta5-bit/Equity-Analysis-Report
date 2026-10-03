import { Writable } from "node:stream";
import { pino } from "pino";
import { describe, expect, it } from "vitest";
import { createLogger } from "./logger";
import { deepRedact, isSensitiveKey } from "./redaction";

describe("isSensitiveKey", () => {
  it.each([
    "password",
    "passwordHash",
    "totpSecret",
    "accessToken",
    "refreshToken",
    "transcriptText",
    "phoneE164",
    "e164Number",
    "recordingObjectKey",
    "authorization",
    "cookie",
    "csrfToken",
    "apiKey",
    "signature",
    "nonce",
  ])("flags %s as sensitive", (key) => {
    expect(isSensitiveKey(key)).toBe(true);
  });

  it.each(["locationId", "appointmentId", "status", "durationMinutes"])(
    "does not flag %s as sensitive",
    (key) => {
      expect(isSensitiveKey(key)).toBe(false);
    },
  );
});

describe("deepRedact", () => {
  it("redacts sensitive keys at every nesting depth", () => {
    const input = {
      callId: "call-1",
      transcriptText: "caller said something private",
      contact: { phoneE164: "+966500000000", displayName: "Ok to log" },
      turns: [{ speaker: "caller", transcriptText: "hello" }],
      auth: { refreshToken: "abc.def.ghi" },
    };

    const redacted = deepRedact(input) as Record<string, unknown>;

    expect(redacted["callId"]).toBe("call-1");
    expect(redacted["transcriptText"]).toBe("[REDACTED]");
    expect((redacted["contact"] as Record<string, unknown>)["phoneE164"]).toBe("[REDACTED]");
    expect((redacted["contact"] as Record<string, unknown>)["displayName"]).toBe("Ok to log");
    expect(
      ((redacted["turns"] as Record<string, unknown>[])[0] as Record<string, unknown>)["transcriptText"],
    ).toBe("[REDACTED]");
    expect((redacted["auth"] as Record<string, unknown>)["refreshToken"]).toBe("[REDACTED]");
  });

  it("does not throw on circular references", () => {
    const input: Record<string, unknown> = { callId: "call-1" };
    input["self"] = input;
    expect(() => deepRedact(input)).not.toThrow();
  });
});

function makeSink(): { sink: Writable; read: () => string } {
  const chunks: string[] = [];
  const sink = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(chunk.toString());
      callback();
    },
  });
  return { sink, read: () => chunks.join("\n") };
}

const SENSITIVE_PAYLOAD = {
  callId: "call-1",
  transcriptText: "this must never appear in logs",
  contact: { phoneE164: "+966512345678" },
  recordingObjectKey: "recordings/tenant/call-1.wav",
  accessToken: "super-secret-token",
};

describe("logger redaction end-to-end (A10.4)", () => {
  it("an unredacted pino instance would leak the sensitive fields (sanity check for the assertion below)", async () => {
    const { sink, read } = makeSink();
    const unguarded = pino({ formatters: { log: (object) => object } }, sink);
    unguarded.info(SENSITIVE_PAYLOAD);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(read()).toContain("this must never appear in logs");
  });

  it("createLogger strips transcript text, phone numbers, recording keys, and tokens", async () => {
    const { sink, read } = makeSink();
    const guarded = createLogger({ serviceName: "test", destination: sink });
    guarded.info(SENSITIVE_PAYLOAD);
    await new Promise((resolve) => setTimeout(resolve, 10));

    const output = read();
    expect(output).not.toContain("this must never appear in logs");
    expect(output).not.toContain("+966512345678");
    expect(output).not.toContain("recordings/tenant/call-1.wav");
    expect(output).not.toContain("super-secret-token");
    expect(output).toContain("[REDACTED]");
    expect(output).toContain("call-1");
  });
});

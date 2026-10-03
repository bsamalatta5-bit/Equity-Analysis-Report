import { describe, expect, it } from "vitest";
import { createAppointmentRequestSchema } from "./appointment";

const base = {
  locationId: "11111111-1111-1111-1111-111111111111",
  staffMemberId: "22222222-2222-2222-2222-222222222222",
  serviceId: "33333333-3333-3333-3333-333333333333",
  startAt: "2030-01-01T09:00:00.000Z",
  contact: { phoneE164: "+966501234567" },
};

describe("createAppointmentRequestSchema", () => {
  it("accepts a dashboard booking without callerConfirmed", () => {
    const result = createAppointmentRequestSchema.safeParse({ ...base, source: "dashboard" });
    expect(result.success).toBe(true);
  });

  it("rejects a voice_call booking missing callId/callerConfirmed (A7.1: no unconfirmed write path)", () => {
    const result = createAppointmentRequestSchema.safeParse({ ...base, source: "voice_call" });
    expect(result.success).toBe(false);
  });

  it("rejects a voice_call booking with callerConfirmed: false — only the literal true satisfies A7.1", () => {
    const result = createAppointmentRequestSchema.safeParse({
      ...base,
      source: "voice_call",
      callId: "44444444-4444-4444-4444-444444444444",
      callerConfirmed: false,
    });
    expect(result.success).toBe(false);
  });

  it("accepts a voice_call booking with callId and callerConfirmed: true", () => {
    const result = createAppointmentRequestSchema.safeParse({
      ...base,
      source: "voice_call",
      callId: "44444444-4444-4444-4444-444444444444",
      callerConfirmed: true,
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown source", () => {
    const result = createAppointmentRequestSchema.safeParse({ ...base, source: "carrier_pigeon" });
    expect(result.success).toBe(false);
  });

  it("rejects a malformed phone number", () => {
    const result = createAppointmentRequestSchema.safeParse({
      ...base,
      source: "dashboard",
      contact: { phoneE164: "0501234567" },
    });
    expect(result.success).toBe(false);
  });
});

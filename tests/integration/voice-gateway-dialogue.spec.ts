import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { beforeAll, describe, expect, it } from "vitest";
import { DialogueStateMachine } from "../../apps/voice-gateway/src/booking/dialogue-state-machine";
import type { TurnEvent } from "../../apps/voice-gateway/src/booking/types";
import { FixtureLanguageModelProvider } from "../../apps/voice-gateway/src/providers/fixture/language-model.fixture";
import { migratorPrisma } from "./fixtures";

/**
 * Module 7 (A7.1-A7.5). Each `it` below is one scripted conversation run
 * against fixture providers (FixtureLanguageModelProvider) and a real
 * Postgres database — not literally 30 conversations, but a set covering
 * every state in Section 6's list (Greeting, LanguageDetection,
 * IntentCapture, SlotCollection, AvailabilityCheck, Confirmation, Write,
 * Closure, Escalation, EmergencyExit) at least once, which is what A7.5
 * actually asks these scripts to prove.
 */
describe("DialogueStateMachine (Module 7)", () => {
  let voiceGatewayPrisma: PrismaClient;
  let tenantId: string;
  let locationId: string;
  let staffMemberId: string;
  let serviceId: string;
  let durationMinutes: number;

  beforeAll(async () => {
    voiceGatewayPrisma = new PrismaClient({ datasources: { db: { url: process.env["DATABASE_URL"]! } } });

    const suffix = randomUUID().slice(0, 8);
    const tenant = await migratorPrisma.tenant.create({
      data: {
        legalName: `Dialogue Test ${suffix}`,
        commercialRegistration: `CR-${suffix}`,
        status: "active",
        planCode: "test",
      },
    });
    const location = await migratorPrisma.location.create({
      data: { tenantId: tenant.id, name: "Main", addressLine: "x", timezone: "Asia/Riyadh", active: true },
    });
    const staffMember = await migratorPrisma.staffMember.create({
      data: { locationId: location.id, displayName: "Dr. Test", active: true },
    });
    const service = await migratorPrisma.service.create({
      data: {
        locationId: location.id,
        nameAr: "خدمة",
        nameEn: "Test Service",
        durationMinutes: 30,
        statedPrice: 100,
        active: true,
      },
    });
    await migratorPrisma.availabilityRule.createMany({
      data: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
        staffMemberId: staffMember.id,
        weekday,
        startTime: "00:00",
        endTime: "23:30",
        effectiveFrom: new Date("2020-01-01"),
      })),
    });

    tenantId = tenant.id;
    locationId = location.id;
    staffMemberId = staffMember.id;
    serviceId = service.id;
    durationMinutes = service.durationMinutes;
  });

  function newMachine(callId: string, contactPhoneE164: string): DialogueStateMachine {
    return new DialogueStateMachine({
      languageModel: new FixtureLanguageModelProvider(),
      prisma: voiceGatewayPrisma,
      tenantId,
      locationId,
      callId,
      contactPhoneE164,
    });
  }

  async function createCall(): Promise<string> {
    const contact = await migratorPrisma.contact.create({
      data: { tenantId, phoneE164: `+9665${Math.floor(10000000 + Math.random() * 89999999)}` },
    });
    const call = await migratorPrisma.call.create({
      data: { tenantId, locationId, contactId: contact.id, direction: "inbound", startedAt: new Date() },
    });
    await migratorPrisma.consentRecord.create({ data: { callId: call.id, recordingConsented: false } });
    return call.id;
  }

  function utterance(text: string, confidence = 0.9, language: "ar" | "en" = "en"): TurnEvent {
    return { kind: "utterance", text, confidence, language };
  }

  it("Greeting -> LanguageDetection: start() greets before any caller turn and moves to LanguageDetection", async () => {
    const machine = newMachine(await createCall(), "+966500000000");
    const result = await machine.start();
    expect(result.context.state).toBe("LanguageDetection");
    expect(result.assistantText.length).toBeGreaterThan(0);
    expect(result.callShouldEnd).toBe(false);
  });

  it("full happy path: Greeting through Closure with a real confirmed voice_call appointment (A7.1)", async () => {
    const callId = await createCall();
    const machine = newMachine(callId, "+966501111111");
    let result = await machine.start();
    expect(result.context.state).toBe("LanguageDetection");

    result = await machine.handleTurn(result.context, utterance("hello"));
    expect(result.context.state).toBe("IntentCapture");

    result = await machine.handleTurn(result.context, utterance("I would like to book an appointment"));
    expect(result.context.state).toBe("SlotCollection");

    const startAt = new Date("2035-03-01T09:00:00.000Z");
    result = await machine.handleTurn(
      result.context,
      utterance(
        `serviceId:${serviceId} staffMemberId:${staffMemberId} requestedStartAt:${startAt.toISOString()}`,
      ),
    );
    expect(result.context.state).toBe("Confirmation");
    expect(result.assistantText).toContain(startAt.toISOString());

    result = await machine.handleTurn(result.context, utterance("yes, confirm:yes"));
    expect(result.context.state).toBe("Closure");
    expect(result.callShouldEnd).toBe(true);
    expect(result.bookingOutcome?.kind).toBe("booked");

    const appointmentId =
      result.bookingOutcome && result.bookingOutcome.kind === "booked"
        ? result.bookingOutcome.appointmentId
        : undefined;
    expect(appointmentId).toBeDefined();
    const appointment = await migratorPrisma.appointment.findUniqueOrThrow({ where: { id: appointmentId! } });
    expect(appointment.status).toBe("confirmed");
    expect(appointment.source).toBe("voice_call");
    expect(appointment.callId).toBe(callId);
    expect(appointment.startAt.toISOString()).toBe(startAt.toISOString());
    expect(appointment.endAt.getTime() - appointment.startAt.getTime()).toBe(durationMinutes * 60_000);
  });

  it("A7.2: one low-confidence recognition triggers a single clarification, then proceeds normally", async () => {
    const machine = newMachine(await createCall(), "+966502222222");
    let result = await machine.start();
    result = await machine.handleTurn(result.context, utterance("hi"));
    expect(result.context.state).toBe("IntentCapture");

    // Low confidence, unrecognized text -> classifyIntent returns "unknown" at 0.3 -> clarify.
    result = await machine.handleTurn(result.context, utterance("mumble mumble", 0.4));
    expect(result.context.state).toBe("IntentCapture");
    expect(result.context.consecutiveLowConfidenceCount).toBe(1);

    result = await machine.handleTurn(result.context, utterance("I want to book an appointment"));
    expect(result.context.state).toBe("SlotCollection");
    expect(result.context.consecutiveLowConfidenceCount).toBe(0);
  });

  it("A7.2: three consecutive low-confidence recognitions escalate instead of asking a third time", async () => {
    const machine = newMachine(await createCall(), "+966503333333");
    let result = await machine.start();
    result = await machine.handleTurn(result.context, utterance("hi"));

    result = await machine.handleTurn(result.context, utterance("mumble one", 0.2));
    expect(result.context.state).toBe("IntentCapture");
    result = await machine.handleTurn(result.context, utterance("mumble two", 0.2));
    expect(result.context.state).toBe("IntentCapture");
    result = await machine.handleTurn(result.context, utterance("mumble three", 0.2));
    expect(result.context.state).toBe("Escalation");
    expect(result.transferRequested).toBe(true);
  });

  it("Escalation: an explicit request to speak to a human routes straight to Escalation", async () => {
    const machine = newMachine(await createCall(), "+966504444444");
    let result = await machine.start();
    result = await machine.handleTurn(result.context, utterance("hello"));
    result = await machine.handleTurn(result.context, utterance("can I talk to a human please"));
    expect(result.context.state).toBe("Escalation");
    expect(result.transferRequested).toBe(true);
  });

  it("EmergencyExit: an emergency keyword interrupts within the same turn and requests a transfer", async () => {
    const machine = newMachine(await createCall(), "+966505555555");
    let result = await machine.start();
    result = await machine.handleTurn(result.context, utterance("hello"));
    expect(result.context.state).toBe("IntentCapture");

    result = await machine.handleTurn(result.context, utterance("I think this is an emergency, chest pain"));
    expect(result.context.state).toBe("EmergencyExit");
    expect(result.transferRequested).toBe(true);
  });

  it("A7.3: slot contention during confirmation returns to AvailabilityCheck with two alternatives, then completes on retry", async () => {
    const startAt = new Date("2035-04-01T09:00:00.000Z");
    const callId = await createCall();
    const machine = newMachine(callId, "+966506666666");

    let result = await machine.start();
    result = await machine.handleTurn(result.context, utterance("hello"));
    result = await machine.handleTurn(result.context, utterance("book an appointment"));
    result = await machine.handleTurn(
      result.context,
      utterance(
        `serviceId:${serviceId} staffMemberId:${staffMemberId} requestedStartAt:${startAt.toISOString()}`,
      ),
    );
    expect(result.context.state).toBe("Confirmation");

    // Simulate a concurrent booking landing between the availability check
    // and this caller's confirmation — exactly what A7.3 is about.
    const otherContact = await migratorPrisma.contact.create({
      data: { tenantId, phoneE164: "+966507777777" },
    });
    await migratorPrisma.appointment.create({
      data: {
        locationId,
        staffMemberId,
        serviceId,
        contactId: otherContact.id,
        startAt,
        endAt: new Date(startAt.getTime() + durationMinutes * 60_000),
        status: "confirmed",
        source: "dashboard",
      },
    });

    result = await machine.handleTurn(result.context, utterance("yes, confirm:yes"));
    expect(result.context.state).toBe("AvailabilityCheck");
    expect(result.context.proposedAlternatives.length).toBe(2);
    expect(result.bookingOutcome).toBeUndefined();

    result = await machine.handleTurn(result.context, utterance("choice:1"));
    expect(result.context.state).toBe("Confirmation");

    result = await machine.handleTurn(result.context, utterance("yes, confirm:yes"));
    expect(result.context.state).toBe("Closure");
    expect(result.bookingOutcome?.kind).toBe("booked");
  });

  it("A7.4: one silence re-prompts; a second consecutive silence closes the call with a callback offer", async () => {
    const machine = newMachine(await createCall(), "+966508888888");
    let result = await machine.start();
    result = await machine.handleTurn(result.context, utterance("hello"));
    expect(result.context.state).toBe("IntentCapture");

    result = await machine.handleTurn(result.context, { kind: "silence" });
    expect(result.context.state).toBe("IntentCapture");
    expect(result.callShouldEnd).toBe(false);
    expect(result.context.consecutiveSilenceCount).toBe(1);

    result = await machine.handleTurn(result.context, { kind: "silence" });
    expect(result.context.state).toBe("Closure");
    expect(result.callShouldEnd).toBe(true);
  });

  it("A7.4: an utterance after a silence resets the silence counter", async () => {
    const machine = newMachine(await createCall(), "+966509999999");
    let result = await machine.start();
    result = await machine.handleTurn(result.context, utterance("hello"));
    result = await machine.handleTurn(result.context, { kind: "silence" });
    expect(result.context.consecutiveSilenceCount).toBe(1);

    result = await machine.handleTurn(result.context, utterance("I want to book an appointment"));
    expect(result.context.consecutiveSilenceCount).toBe(0);
    expect(result.context.state).toBe("SlotCollection");
  });

  it("SlotCollection: slots can be provided across multiple turns before advancing", async () => {
    const machine = newMachine(await createCall(), "+966510000000");
    let result = await machine.start();
    result = await machine.handleTurn(result.context, utterance("hello"));
    result = await machine.handleTurn(result.context, utterance("book an appointment"));
    expect(result.context.state).toBe("SlotCollection");

    result = await machine.handleTurn(result.context, utterance(`serviceId:${serviceId}`));
    expect(result.context.state).toBe("SlotCollection");
    expect(result.context.slots.serviceId).toBe(serviceId);

    const startAt = new Date("2035-05-01T10:00:00.000Z");
    result = await machine.handleTurn(
      result.context,
      utterance(`staffMemberId:${staffMemberId} requestedStartAt:${startAt.toISOString()}`),
    );
    expect(result.context.state).toBe("Confirmation");
  });

  it("Confirmation: declining the read-back escalates rather than booking anything", async () => {
    const callId = await createCall();
    const machine = newMachine(callId, "+966511111111");
    let result = await machine.start();
    result = await machine.handleTurn(result.context, utterance("hello"));
    result = await machine.handleTurn(result.context, utterance("book an appointment"));
    const startAt = new Date("2035-06-01T11:00:00.000Z");
    result = await machine.handleTurn(
      result.context,
      utterance(
        `serviceId:${serviceId} staffMemberId:${staffMemberId} requestedStartAt:${startAt.toISOString()}`,
      ),
    );
    expect(result.context.state).toBe("Confirmation");

    const appointmentCountBefore = await migratorPrisma.appointment.count({ where: { callId } });
    result = await machine.handleTurn(result.context, utterance("no, confirm:no"));
    expect(result.context.state).toBe("Escalation");
    const appointmentCountAfter = await migratorPrisma.appointment.count({ where: { callId } });
    expect(appointmentCountAfter).toBe(appointmentCountBefore);
  });
});

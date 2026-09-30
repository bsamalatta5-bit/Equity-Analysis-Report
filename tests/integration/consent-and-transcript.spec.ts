import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { ConsentNotRecordedError } from "@voice-receptionist/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DialogueStateMachine } from "../../apps/voice-gateway/src/booking/dialogue-state-machine";
import { withTenant } from "../../apps/voice-gateway/src/common/prisma-client";
import { recordCallTurn } from "../../apps/voice-gateway/src/pipeline/transcript";
import { FixtureLanguageModelProvider } from "../../apps/voice-gateway/src/providers/fixture/language-model.fixture";
import { migratorPrisma } from "./fixtures";

describe("Consent and transcript persistence (Module 10, A10.1)", () => {
  let voiceGatewayPrisma: PrismaClient;
  let tenantId: string;
  let locationId: string;

  beforeAll(async () => {
    voiceGatewayPrisma = new PrismaClient({ datasources: { db: { url: process.env["DATABASE_URL"]! } } });
    const suffix = randomUUID().slice(0, 8);
    const tenant = await migratorPrisma.tenant.create({
      data: {
        legalName: `Consent Test ${suffix}`,
        commercialRegistration: `CR-${suffix}`,
        status: "active",
        planCode: "test",
      },
    });
    const location = await migratorPrisma.location.create({
      data: { tenantId: tenant.id, name: "Main", addressLine: "x", timezone: "Asia/Riyadh", active: true },
    });
    tenantId = tenant.id;
    locationId = location.id;
  });

  afterAll(async () => {
    await voiceGatewayPrisma.$disconnect();
  });

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

  it("recordCallTurn refuses to persist caller speech before consent is recorded (A10.1)", async () => {
    const callId = await createCall();
    const consentBefore = await migratorPrisma.consentRecord.findUniqueOrThrow({ where: { callId } });
    expect(consentBefore.announcementPlayedAt).toBeNull();

    await expect(
      withTenant(voiceGatewayPrisma, tenantId, (tx) =>
        recordCallTurn(tx, { callId, speaker: "caller", transcriptText: "should never be persisted" }),
      ),
    ).rejects.toThrow(ConsentNotRecordedError);

    const turns = await migratorPrisma.callTurn.findMany({ where: { callId } });
    expect(turns).toHaveLength(0);
  });

  it("start() marks the consent announcement as played and speaks a recording-consent message", async () => {
    const callId = await createCall();
    const machine = new DialogueStateMachine({
      languageModel: new FixtureLanguageModelProvider(),
      prisma: voiceGatewayPrisma,
      tenantId,
      locationId,
      callId,
      contactPhoneE164: "+966501234567",
    });

    const before = await migratorPrisma.consentRecord.findUniqueOrThrow({ where: { callId } });
    expect(before.announcementPlayedAt).toBeNull();

    const result = await machine.start();

    const after = await migratorPrisma.consentRecord.findUniqueOrThrow({ where: { callId } });
    expect(after.announcementPlayedAt).not.toBeNull();
    expect(result.assistantText.toLowerCase()).toContain("recorded");
  });

  it("handleTurn persists both the caller's and the assistant's turns as CallTurn rows, in sequence, after consent", async () => {
    const callId = await createCall();
    const machine = new DialogueStateMachine({
      languageModel: new FixtureLanguageModelProvider(),
      prisma: voiceGatewayPrisma,
      tenantId,
      locationId,
      callId,
      contactPhoneE164: "+966501234568",
    });

    let result = await machine.start();
    // No CallTurn for the greeting itself — start() speaks before any caller turn exists to pair it with.
    expect(await migratorPrisma.callTurn.count({ where: { callId } })).toBe(0);

    result = await machine.handleTurn(result.context, {
      kind: "utterance",
      text: "hello",
      confidence: 0.9,
      language: "en",
    });

    const turns = await migratorPrisma.callTurn.findMany({ where: { callId }, orderBy: { sequence: "asc" } });
    expect(turns).toHaveLength(2);
    expect(turns[0]!.speaker).toBe("caller");
    expect(turns[0]!.transcriptText).toBe("hello");
    expect(turns[0]!.sequence).toBe(0);
    expect(turns[1]!.speaker).toBe("assistant");
    expect(turns[1]!.transcriptText).toBe(result.assistantText);
    expect(turns[1]!.sequence).toBe(1);
  });

  it("a silence event is never persisted as a CallTurn (it is not caller speech)", async () => {
    const callId = await createCall();
    const machine = new DialogueStateMachine({
      languageModel: new FixtureLanguageModelProvider(),
      prisma: voiceGatewayPrisma,
      tenantId,
      locationId,
      callId,
      contactPhoneE164: "+966501234569",
    });

    const result = await machine.start();
    await machine.handleTurn(result.context, { kind: "silence" });

    expect(await migratorPrisma.callTurn.count({ where: { callId } })).toBe(0);
  });
});

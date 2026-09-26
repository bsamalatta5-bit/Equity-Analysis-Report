import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { INestApplication } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { ProviderFailureError } from "@voice-receptionist/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DialogueStateMachine } from "../../apps/voice-gateway/src/booking/dialogue-state-machine";
import type { TurnEvent } from "../../apps/voice-gateway/src/booking/types";
import { withTenant } from "../../apps/voice-gateway/src/common/prisma-client";
import { decideProviderFailureEscalation } from "../../apps/voice-gateway/src/degradation/provider-failure";
import { FixtureLanguageModelProvider } from "../../apps/voice-gateway/src/providers/fixture/language-model.fixture";
import type { LanguageModelProvider } from "../../apps/voice-gateway/src/providers/language-model.provider";
import { containsClinicalContent } from "../../apps/voice-gateway/src/safety/clinical-content-guard";
import { adversarialPromptSetSchema } from "../../apps/voice-gateway/src/safety/safety-corpus";
import { bootstrapApp, createTestTenant, loginAgent, migratorPrisma, resetAuthRateLimits } from "./fixtures";

/** Riyadh has no DST — a fixed +3h offset reproduces exactly what date-fns-tz's toZonedTime would return for it, with no extra dependency. */
function riyadhWeekdayAndTime(utcInstant: Date): { weekday: number; time: string } {
  const shifted = new Date(utcInstant.getTime() + 3 * 60 * 60 * 1000);
  const weekday = shifted.getUTCDay();
  const time = `${shifted.getUTCHours().toString().padStart(2, "0")}:${shifted
    .getUTCMinutes()
    .toString()
    .padStart(2, "0")}`;
  return { weekday, time };
}

/** Throws on every call — a provider that has genuinely failed, not a fixture with a scripted answer. */
class FailingLanguageModelProvider implements LanguageModelProvider {
  readonly providerName = "failing-test-double";
  async classifyIntent(): Promise<never> {
    throw new ProviderFailureError(this.providerName, "classifyIntent");
  }
  async extractSlots(): Promise<never> {
    throw new ProviderFailureError(this.providerName, "extractSlots");
  }
  async draftGroundedResponse(): Promise<never> {
    throw new ProviderFailureError(this.providerName, "draftGroundedResponse");
  }
}

describe("Safety and escalation (Module 9)", () => {
  describe("Safety classifier interrupts every dialogue state (A9.1, A9.3)", () => {
    let voiceGatewayPrisma: PrismaClient;
    let tenantId: string;
    let locationId: string;

    beforeAll(async () => {
      voiceGatewayPrisma = new PrismaClient({ datasources: { db: { url: process.env["DATABASE_URL"]! } } });
      const suffix = randomUUID().slice(0, 8);
      const tenant = await migratorPrisma.tenant.create({
        data: {
          legalName: `Safety Test ${suffix}`,
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
      return call.id;
    }

    function newMachine(callId: string): DialogueStateMachine {
      return new DialogueStateMachine({
        languageModel: new FixtureLanguageModelProvider(),
        prisma: voiceGatewayPrisma,
        tenantId,
        locationId,
        callId,
        contactPhoneE164: "+966507777777",
      });
    }

    function utterance(text: string): TurnEvent {
      return { kind: "utterance", text, confidence: 0.9, language: "en" };
    }

    it("an emergency phrase interrupts from IntentCapture and records disposition emergency_transfer", async () => {
      const callId = await createCall();
      const machine = newMachine(callId);
      let result = machine.start();
      result = await machine.handleTurn(result.context, utterance("hello"));
      expect(result.context.state).toBe("IntentCapture");

      result = await machine.handleTurn(result.context, utterance("I'm having chest pain and can't breathe"));
      expect(result.context.state).toBe("EmergencyExit");
      expect(result.transferRequested).toBe(true);

      const call = await migratorPrisma.call.findUniqueOrThrow({ where: { id: callId } });
      expect(call.disposition).toBe("emergency_transfer");
    });

    it("A9.1: an emergency phrase interrupts mid-booking (SlotCollection), not only during IntentCapture", async () => {
      const callId = await createCall();
      const machine = newMachine(callId);
      let result = machine.start();
      result = await machine.handleTurn(result.context, utterance("hello"));
      result = await machine.handleTurn(result.context, utterance("I would like to book an appointment"));
      expect(result.context.state).toBe("SlotCollection");

      result = await machine.handleTurn(result.context, utterance("severe bleeding, it won't stop"));
      expect(result.context.state).toBe("EmergencyExit");
      expect(result.transferRequested).toBe(true);
    });

    it("a clinical (non-life-threatening) request is treated identically to an emergency, per A9.3", async () => {
      const callId = await createCall();
      const machine = newMachine(callId);
      let result = machine.start();
      result = await machine.handleTurn(result.context, utterance("hello"));

      result = await machine.handleTurn(
        result.context,
        utterance("What medication should I take for this rash?"),
      );
      expect(result.context.state).toBe("EmergencyExit");
      expect(result.transferRequested).toBe(true);
    });
  });

  describe("A9.4: adversarial corpus — no clinical content ever reaches the caller", () => {
    let voiceGatewayPrisma: PrismaClient;
    let tenantId: string;
    let locationId: string;

    beforeAll(async () => {
      voiceGatewayPrisma = new PrismaClient({ datasources: { db: { url: process.env["DATABASE_URL"]! } } });
      const suffix = randomUUID().slice(0, 8);
      const tenant = await migratorPrisma.tenant.create({
        data: {
          legalName: `Adversarial Test ${suffix}`,
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

    it("every prompt in the placeholder adversarial set produces an assistant response with zero clinical content", async () => {
      const path = join(__dirname, "../voice/corpora/adversarial-clinical-prompts.synthetic-example.json");
      const manifest = adversarialPromptSetSchema.parse(JSON.parse(readFileSync(path, "utf-8")));
      expect(manifest.isSyntheticPlaceholder).toBe(true);

      for (const prompt of manifest.prompts) {
        const contact = await migratorPrisma.contact.create({
          data: { tenantId, phoneE164: `+9665${Math.floor(10000000 + Math.random() * 89999999)}` },
        });
        const call = await migratorPrisma.call.create({
          data: { tenantId, locationId, contactId: contact.id, direction: "inbound", startedAt: new Date() },
        });
        const machine = new DialogueStateMachine({
          languageModel: new FixtureLanguageModelProvider(),
          prisma: voiceGatewayPrisma,
          tenantId,
          locationId,
          callId: call.id,
          contactPhoneE164: contact.phoneE164,
        });

        let result = machine.start();
        result = await machine.handleTurn(result.context, {
          kind: "utterance",
          text: "hello",
          confidence: 0.9,
          language: prompt.language,
        });
        result = await machine.handleTurn(result.context, {
          kind: "utterance",
          text: prompt.text,
          confidence: 0.9,
          language: prompt.language,
        });

        expect(containsClinicalContent(result.assistantText)).toBe(false);
      }
    });
  });

  describe("A9.5: provider failure escalation", () => {
    let voiceGatewayPrisma: PrismaClient;
    let tenantId: string;

    beforeAll(async () => {
      voiceGatewayPrisma = new PrismaClient({ datasources: { db: { url: process.env["DATABASE_URL"]! } } });
      const suffix = randomUUID().slice(0, 8);
      const tenant = await migratorPrisma.tenant.create({
        data: {
          legalName: `Provider Failure Test ${suffix}`,
          commercialRegistration: `CR-${suffix}`,
          status: "active",
          planCode: "test",
        },
      });
      tenantId = tenant.id;
      // Each test below creates its own Location (and, where relevant, its
      // own EscalationRule) — the active-hours/rule-presence combinations
      // under test differ per case, so a single shared location would force
      // them to share state.
    });

    afterAll(async () => {
      await voiceGatewayPrisma.$disconnect();
    });

    describe("decideProviderFailureEscalation (direct, controlled clock)", () => {
      const now = new Date("2030-06-05T10:00:00.000Z"); // Riyadh local: see riyadhWeekdayAndTime
      const { weekday, time } = riyadhWeekdayAndTime(now);

      it("defaults to transfer when no EscalationRule is configured for the location", async () => {
        const freshLocation = await migratorPrisma.location.create({
          data: { tenantId, name: "No Rule Branch", addressLine: "x", timezone: "Asia/Riyadh", active: true },
        });
        const decision = await withTenant(voiceGatewayPrisma, tenantId, (tx) =>
          decideProviderFailureEscalation(tx, { locationId: freshLocation.id, now }),
        );
        expect(decision.kind).toBe("transfer");
      });

      it("transfers when a rule exists and 'now' falls inside one of its windows", async () => {
        const loc = await migratorPrisma.location.create({
          data: {
            tenantId,
            name: "In Hours Branch",
            addressLine: "x",
            timezone: "Asia/Riyadh",
            active: true,
          },
        });
        await migratorPrisma.escalationRule.create({
          data: {
            locationId: loc.id,
            triggerType: "provider_failure",
            targetPhoneE164: "+966508888888",
            activeHours: { windows: [{ weekday, startTime: "00:00", endTime: "23:59" }] },
          },
        });
        const decision = await withTenant(voiceGatewayPrisma, tenantId, (tx) =>
          decideProviderFailureEscalation(tx, { locationId: loc.id, now }),
        );
        expect(decision.kind).toBe("transfer");
      });

      it("captures a message when a rule exists but 'now' falls outside every window", async () => {
        const loc = await migratorPrisma.location.create({
          data: {
            tenantId,
            name: "Out Of Hours Branch",
            addressLine: "x",
            timezone: "Asia/Riyadh",
            active: true,
          },
        });
        const otherWeekday = (weekday + 3) % 7;
        await migratorPrisma.escalationRule.create({
          data: {
            locationId: loc.id,
            triggerType: "provider_failure",
            targetPhoneE164: "+966508888888",
            activeHours: { windows: [{ weekday: otherWeekday, startTime: "00:00", endTime: "23:59" }] },
          },
        });
        const decision = await withTenant(voiceGatewayPrisma, tenantId, (tx) =>
          decideProviderFailureEscalation(tx, { locationId: loc.id, now }),
        );
        expect(decision.kind).toBe("message_capture");
      });

      it("captures a message when a rule exists with no windows configured at all", async () => {
        const loc = await migratorPrisma.location.create({
          data: {
            tenantId,
            name: "Empty Windows Branch",
            addressLine: "x",
            timezone: "Asia/Riyadh",
            active: true,
          },
        });
        await migratorPrisma.escalationRule.create({
          data: {
            locationId: loc.id,
            triggerType: "provider_failure",
            targetPhoneE164: "+966508888888",
            activeHours: { windows: [] },
          },
        });
        const decision = await withTenant(voiceGatewayPrisma, tenantId, (tx) =>
          decideProviderFailureEscalation(tx, { locationId: loc.id, now }),
        );
        expect(decision.kind).toBe("message_capture");
        expect(time.length).toBe(5); // sanity: riyadhWeekdayAndTime produced an "HH:MM" string
      });
    });

    describe("DialogueStateMachine wiring (a provider throws mid-turn)", () => {
      async function createCall(callLocationId: string): Promise<string> {
        const contact = await migratorPrisma.contact.create({
          data: { tenantId, phoneE164: `+9665${Math.floor(10000000 + Math.random() * 89999999)}` },
        });
        const call = await migratorPrisma.call.create({
          data: {
            tenantId,
            locationId: callLocationId,
            contactId: contact.id,
            direction: "inbound",
            startedAt: new Date(),
          },
        });
        return call.id;
      }

      it("transfers and records disposition provider_failure when no EscalationRule is configured", async () => {
        const loc = await migratorPrisma.location.create({
          data: {
            tenantId,
            name: "FSM No Rule Branch",
            addressLine: "x",
            timezone: "Asia/Riyadh",
            active: true,
          },
        });
        const callId = await createCall(loc.id);
        const machine = new DialogueStateMachine({
          languageModel: new FailingLanguageModelProvider(),
          prisma: voiceGatewayPrisma,
          tenantId,
          locationId: loc.id,
          callId,
          contactPhoneE164: "+966509999999",
        });
        let result = machine.start();
        // handleLanguageDetection never calls the language model — the
        // failure surfaces on the first turn that reaches IntentCapture's
        // classifyIntent call.
        result = await machine.handleTurn(result.context, {
          kind: "utterance",
          text: "hello",
          confidence: 0.9,
          language: "en",
        });
        expect(result.context.state).toBe("IntentCapture");
        result = await machine.handleTurn(result.context, {
          kind: "utterance",
          text: "I would like to book an appointment",
          confidence: 0.9,
          language: "en",
        });
        expect(result.context.state).toBe("Escalation");
        expect(result.transferRequested).toBe(true);

        const call = await migratorPrisma.call.findUniqueOrThrow({ where: { id: callId } });
        expect(call.disposition).toBe("provider_failure");
      });

      it("captures a message and records disposition message_captured when the configured rule has no active-hours windows", async () => {
        const loc = await migratorPrisma.location.create({
          data: {
            tenantId,
            name: "FSM Empty Windows Branch",
            addressLine: "x",
            timezone: "Asia/Riyadh",
            active: true,
          },
        });
        await migratorPrisma.escalationRule.create({
          data: {
            locationId: loc.id,
            triggerType: "provider_failure",
            targetPhoneE164: "+966508888888",
            activeHours: { windows: [] },
          },
        });
        const callId = await createCall(loc.id);
        const machine = new DialogueStateMachine({
          languageModel: new FailingLanguageModelProvider(),
          prisma: voiceGatewayPrisma,
          tenantId,
          locationId: loc.id,
          callId,
          contactPhoneE164: "+966509999999",
        });
        let result = machine.start();
        result = await machine.handleTurn(result.context, {
          kind: "utterance",
          text: "hello",
          confidence: 0.9,
          language: "en",
        });
        expect(result.context.state).toBe("IntentCapture");
        result = await machine.handleTurn(result.context, {
          kind: "utterance",
          text: "I would like to book an appointment",
          confidence: 0.9,
          language: "en",
        });
        expect(result.context.state).toBe("Closure");
        expect(result.callShouldEnd).toBe(true);
        expect(result.transferRequested).toBe(false);

        const call = await migratorPrisma.call.findUniqueOrThrow({ where: { id: callId } });
        expect(call.disposition).toBe("message_captured");
      });
    });
  });

  describe("Call.disposition recorded for other terminal outcomes", () => {
    let voiceGatewayPrisma: PrismaClient;
    let tenantId: string;
    let locationId: string;

    beforeAll(async () => {
      voiceGatewayPrisma = new PrismaClient({ datasources: { db: { url: process.env["DATABASE_URL"]! } } });
      const suffix = randomUUID().slice(0, 8);
      const tenant = await migratorPrisma.tenant.create({
        data: {
          legalName: `Disposition Test ${suffix}`,
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
      return call.id;
    }

    it("records disposition escalated when the caller declines confirmation", async () => {
      const callId = await createCall();
      const machine = new DialogueStateMachine({
        languageModel: new FixtureLanguageModelProvider(),
        prisma: voiceGatewayPrisma,
        tenantId,
        locationId,
        callId,
        contactPhoneE164: "+966501212121",
      });
      let result = machine.start();
      result = await machine.handleTurn(result.context, {
        kind: "utterance",
        text: "hello",
        confidence: 0.9,
        language: "en",
      });
      result = await machine.handleTurn(result.context, {
        kind: "utterance",
        text: "can I speak to a human",
        confidence: 0.9,
        language: "en",
      });
      expect(result.context.state).toBe("Escalation");

      const call = await migratorPrisma.call.findUniqueOrThrow({ where: { id: callId } });
      expect(call.disposition).toBe("escalated");
    });

    it("records disposition abandoned after two consecutive silences", async () => {
      const callId = await createCall();
      const machine = new DialogueStateMachine({
        languageModel: new FixtureLanguageModelProvider(),
        prisma: voiceGatewayPrisma,
        tenantId,
        locationId,
        callId,
        contactPhoneE164: "+966501212122",
      });
      let result = machine.start();
      result = await machine.handleTurn(result.context, {
        kind: "utterance",
        text: "hello",
        confidence: 0.9,
        language: "en",
      });
      result = await machine.handleTurn(result.context, { kind: "silence" });
      result = await machine.handleTurn(result.context, { kind: "silence" });
      expect(result.context.state).toBe("Closure");
      expect(result.callShouldEnd).toBe(true);

      const call = await migratorPrisma.call.findUniqueOrThrow({ where: { id: callId } });
      expect(call.disposition).toBe("abandoned");
    });
  });

  describe("apps/api Escalation rule CRUD (RBAC)", () => {
    let app: INestApplication;
    let tenantId: string;
    let locationId: string;
    let fixture: Awaited<ReturnType<typeof createTestTenant>>;

    beforeAll(async () => {
      await resetAuthRateLimits();
      app = await bootstrapApp();
      fixture = await createTestTenant({
        owner: { role: "tenant_owner", password: "OwnerPassw0rd!123" },
        frontDesk: { role: "front_desk_user", password: "FrontDeskPassw0rd!123" },
      });
      tenantId = fixture.tenantId;
      locationId = fixture.locationId;
    });

    afterAll(async () => {
      await app.close();
    });

    it("tenant_owner can create, list, update, and delete an escalation rule; front_desk_user can only read", async () => {
      const owner = await loginAgent(app, fixture.users["owner"]!);
      const frontDesk = await loginAgent(app, fixture.users["frontDesk"]!);

      const forbidden = await frontDesk.agent
        .post(`/tenants/${tenantId}/locations/${locationId}/escalation-rules`)
        .set("x-csrf-token", frontDesk.csrfToken)
        .send({
          triggerType: "provider_failure",
          targetPhoneE164: "+966508888888",
          activeHours: { windows: [{ weekday: 0, startTime: "09:00", endTime: "17:00" }] },
        });
      expect(forbidden.status).toBe(403);

      const created = await owner.agent
        .post(`/tenants/${tenantId}/locations/${locationId}/escalation-rules`)
        .set("x-csrf-token", owner.csrfToken)
        .send({
          triggerType: "provider_failure",
          targetPhoneE164: "+966508888888",
          activeHours: { windows: [{ weekday: 0, startTime: "09:00", endTime: "17:00" }] },
        });
      expect(created.status).toBe(201);
      const ruleId = created.body.id as string;

      const listedByFrontDesk = await frontDesk.agent
        .get(`/tenants/${tenantId}/locations/${locationId}/escalation-rules`)
        .set("x-csrf-token", frontDesk.csrfToken);
      expect(listedByFrontDesk.status).toBe(200);
      expect((listedByFrontDesk.body as { id: string }[]).some((r) => r.id === ruleId)).toBe(true);

      const updated = await owner.agent
        .patch(`/tenants/${tenantId}/locations/${locationId}/escalation-rules/${ruleId}`)
        .set("x-csrf-token", owner.csrfToken)
        .send({ targetPhoneE164: "+966509999999" });
      expect(updated.status).toBe(200);
      expect(updated.body.targetPhoneE164).toBe("+966509999999");

      const deleteForbidden = await frontDesk.agent
        .delete(`/tenants/${tenantId}/locations/${locationId}/escalation-rules/${ruleId}`)
        .set("x-csrf-token", frontDesk.csrfToken);
      expect(deleteForbidden.status).toBe(403);

      const deleted = await owner.agent
        .delete(`/tenants/${tenantId}/locations/${locationId}/escalation-rules/${ruleId}`)
        .set("x-csrf-token", owner.csrfToken);
      expect(deleted.status).toBe(200);

      const listedAfterDelete = await owner.agent
        .get(`/tenants/${tenantId}/locations/${locationId}/escalation-rules`)
        .set("x-csrf-token", owner.csrfToken);
      expect((listedAfterDelete.body as { id: string }[]).some((r) => r.id === ruleId)).toBe(false);
    });
  });
});

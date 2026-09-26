import { randomUUID } from "node:crypto";
import { INestApplication } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { computeHashingEmbedding, toVectorLiteral, THRESHOLDS } from "@voice-receptionist/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DialogueStateMachine } from "../../apps/voice-gateway/src/booking/dialogue-state-machine";
import type { TurnEvent } from "../../apps/voice-gateway/src/booking/types";
import { withTenant } from "../../apps/voice-gateway/src/common/prisma-client";
import { retrieveTopKnowledgeMatch } from "../../apps/voice-gateway/src/knowledge/retrieval";
import { FixtureLanguageModelProvider } from "../../apps/voice-gateway/src/providers/fixture/language-model.fixture";
import { bootstrapApp, createTestTenant, loginAgent, migratorPrisma, resetAuthRateLimits } from "./fixtures";

/** Bypasses RLS (migratorPrisma) deliberately, mirroring apps/api/prisma/seed.ts's own raw insert — test setup only. */
async function insertKnowledgeItem(params: {
  tenantId: string;
  questionText: string;
  answerText: string;
  language: "ar" | "en";
  active?: boolean;
}): Promise<string> {
  const id = randomUUID();
  const embedding = toVectorLiteral(computeHashingEmbedding(params.questionText));
  await migratorPrisma.$executeRaw`
    INSERT INTO "KnowledgeItem" (id, "tenantId", "questionText", "answerText", language, embedding, active)
    VALUES (
      ${id}::uuid,
      ${params.tenantId}::uuid,
      ${params.questionText},
      ${params.answerText},
      ${params.language}::"KnowledgeLanguage",
      ${embedding}::vector(1536),
      ${params.active ?? true}
    )
  `;
  return id;
}

describe("Knowledge retrieval (Module 8)", () => {
  describe("retrieveTopKnowledgeMatch (A8.1, A8.2)", () => {
    let voiceGatewayPrisma: PrismaClient;
    let tenantAId: string;
    let tenantBId: string;

    beforeAll(async () => {
      voiceGatewayPrisma = new PrismaClient({ datasources: { db: { url: process.env["DATABASE_URL"]! } } });
      const suffix = randomUUID().slice(0, 8);
      const tenantA = await migratorPrisma.tenant.create({
        data: {
          legalName: `Knowledge A ${suffix}`,
          commercialRegistration: `CR-A-${suffix}`,
          status: "active",
          planCode: "test",
        },
      });
      const tenantB = await migratorPrisma.tenant.create({
        data: {
          legalName: `Knowledge B ${suffix}`,
          commercialRegistration: `CR-B-${suffix}`,
          status: "active",
          planCode: "test",
        },
      });
      tenantAId = tenantA.id;
      tenantBId = tenantB.id;

      await insertKnowledgeItem({
        tenantId: tenantAId,
        questionText: "What are your opening hours?",
        answerText: "We are open Sunday to Thursday, 9 AM to 5 PM.",
        language: "en",
      });
      await insertKnowledgeItem({
        tenantId: tenantAId,
        questionText: "How much does teeth whitening cost?",
        answerText: "Teeth whitening costs 450 SAR.",
        language: "en",
      });
      await insertKnowledgeItem({
        tenantId: tenantAId,
        questionText: "متى ساعات العمل لديكم؟",
        answerText: "نستقبل من الأحد إلى الخميس، من التاسعة صباحًا حتى الخامسة مساءً.",
        language: "ar",
      });
      // Tenant B's item uses near-identical wording to tenant A's hours question, so A8.1
      // has something to actually rule out — a bug that dropped the tenantId filter would
      // still very plausibly return tenant A's own hours item, but would just as plausibly
      // leak tenant B's if ordering ever favored it.
      await insertKnowledgeItem({
        tenantId: tenantBId,
        questionText: "What are your opening hours?",
        answerText: "Tenant B is open 24 hours — this must never be returned for tenant A's calls.",
        language: "en",
      });
    });

    afterAll(async () => {
      await voiceGatewayPrisma.$disconnect();
    });

    it("A8.2: an on-topic question matches its own knowledge item at or above the similarity threshold", async () => {
      const match = await withTenant(voiceGatewayPrisma, tenantAId, (tx) =>
        retrieveTopKnowledgeMatch(tx, {
          tenantId: tenantAId,
          queryText: "What are your opening hours?",
          language: "en",
        }),
      );
      expect(match).not.toBeNull();
      expect(match!.answerText).toBe("We are open Sunday to Thursday, 9 AM to 5 PM.");
      expect(match!.similarity).toBeGreaterThanOrEqual(THRESHOLDS.KNOWLEDGE_SIMILARITY_MIN);
    });

    it("A8.2: an unrelated question scores below the similarity threshold (or finds nothing at all)", async () => {
      const match = await withTenant(voiceGatewayPrisma, tenantAId, (tx) =>
        retrieveTopKnowledgeMatch(tx, {
          tenantId: tenantAId,
          queryText: "Is there wheelchair-accessible parking available on site?",
          language: "en",
        }),
      );
      if (match) {
        expect(match.similarity).toBeLessThan(THRESHOLDS.KNOWLEDGE_SIMILARITY_MIN);
      }
    });

    it("A8.1: never returns another tenant's knowledge item, even one with near-identical wording", async () => {
      const match = await withTenant(voiceGatewayPrisma, tenantAId, (tx) =>
        retrieveTopKnowledgeMatch(tx, {
          tenantId: tenantAId,
          queryText: "What are your opening hours?",
          language: "en",
        }),
      );
      expect(match!.answerText).not.toContain("Tenant B");

      const matchForB = await withTenant(voiceGatewayPrisma, tenantBId, (tx) =>
        retrieveTopKnowledgeMatch(tx, {
          tenantId: tenantBId,
          queryText: "What are your opening hours?",
          language: "en",
        }),
      );
      expect(matchForB!.answerText).toContain("Tenant B");
    });

    it("filters by language: an Arabic query only matches an Arabic knowledge item", async () => {
      const match = await withTenant(voiceGatewayPrisma, tenantAId, (tx) =>
        retrieveTopKnowledgeMatch(tx, { tenantId: tenantAId, queryText: "متى ساعات العمل؟", language: "ar" }),
      );
      expect(match).not.toBeNull();
      expect(match!.answerText).toContain("الأحد");
    });

    it("an inactive knowledge item is never returned", async () => {
      const suffix = randomUUID().slice(0, 8);
      const tenant = await migratorPrisma.tenant.create({
        data: {
          legalName: `Inactive Test ${suffix}`,
          commercialRegistration: `CR-I-${suffix}`,
          status: "active",
          planCode: "test",
        },
      });
      await insertKnowledgeItem({
        tenantId: tenant.id,
        questionText: "What are your opening hours?",
        answerText: "This item is inactive and must never be retrieved.",
        language: "en",
        active: false,
      });
      const match = await withTenant(voiceGatewayPrisma, tenant.id, (tx) =>
        retrieveTopKnowledgeMatch(tx, {
          tenantId: tenant.id,
          queryText: "What are your opening hours?",
          language: "en",
        }),
      );
      expect(match).toBeNull();
    });
  });

  describe("apps/api Knowledge CRUD (RBAC + embedding writes)", () => {
    let app: INestApplication;
    let voiceGatewayPrisma: PrismaClient;
    let tenantId: string;
    let fixture: Awaited<ReturnType<typeof createTestTenant>>;

    beforeAll(async () => {
      await resetAuthRateLimits();
      app = await bootstrapApp();
      voiceGatewayPrisma = new PrismaClient({ datasources: { db: { url: process.env["DATABASE_URL"]! } } });
      fixture = await createTestTenant({
        owner: { role: "tenant_owner", password: "OwnerPassw0rd!123" },
        frontDesk: { role: "front_desk_user", password: "FrontDeskPassw0rd!123" },
      });
      tenantId = fixture.tenantId;
    });

    afterAll(async () => {
      await app.close();
      await voiceGatewayPrisma.$disconnect();
    });

    it("A8.1/CRUD: tenant_owner can create a knowledge item; front_desk_user cannot (403)", async () => {
      const owner = await loginAgent(app, fixture.users["owner"]!);
      const frontDesk = await loginAgent(app, fixture.users["frontDesk"]!);

      const forbidden = await frontDesk.agent
        .post(`/tenants/${tenantId}/knowledge`)
        .set("x-csrf-token", frontDesk.csrfToken)
        .send({
          questionText: "Do you take walk-ins?",
          answerText: "Yes, subject to availability.",
          language: "en",
        });
      expect(forbidden.status).toBe(403);

      const created = await owner.agent
        .post(`/tenants/${tenantId}/knowledge`)
        .set("x-csrf-token", owner.csrfToken)
        .send({
          questionText: "Do you take walk-ins?",
          answerText: "Yes, subject to availability.",
          language: "en",
        });
      expect(created.status).toBe(201);
      expect(created.body.questionText).toBe("Do you take walk-ins?");
      expect(created.body).not.toHaveProperty("embedding");

      // The embedding this HTTP write computed is actually retrievable through
      // the voice-gateway's own read path — the two services agree on the
      // same fixture embedding function, not just on the schema.
      const match = await withTenant(voiceGatewayPrisma, tenantId, (tx) =>
        retrieveTopKnowledgeMatch(tx, { tenantId, queryText: "Do you take walk-ins?", language: "en" }),
      );
      expect(match).not.toBeNull();
      expect(match!.answerText).toBe("Yes, subject to availability.");
    });

    it("tenant_owner can list, update, and delete a knowledge item; a deleted item is no longer retrievable", async () => {
      const owner = await loginAgent(app, fixture.users["owner"]!);

      const created = await owner.agent
        .post(`/tenants/${tenantId}/knowledge`)
        .set("x-csrf-token", owner.csrfToken)
        .send({
          questionText: "What is your cancellation policy?",
          answerText: "24 hours notice, please.",
          language: "en",
        });
      expect(created.status).toBe(201);
      const itemId = created.body.id as string;

      const listed = await owner.agent
        .get(`/tenants/${tenantId}/knowledge`)
        .set("x-csrf-token", owner.csrfToken);
      expect(listed.status).toBe(200);
      expect((listed.body as { id: string }[]).some((item) => item.id === itemId)).toBe(true);

      const updated = await owner.agent
        .patch(`/tenants/${tenantId}/knowledge/${itemId}`)
        .set("x-csrf-token", owner.csrfToken)
        .send({ answerText: "48 hours notice, please." });
      expect(updated.status).toBe(200);
      expect(updated.body.answerText).toBe("48 hours notice, please.");

      const matchAfterUpdate = await withTenant(voiceGatewayPrisma, tenantId, (tx) =>
        retrieveTopKnowledgeMatch(tx, {
          tenantId,
          queryText: "What is your cancellation policy?",
          language: "en",
        }),
      );
      expect(matchAfterUpdate!.answerText).toBe("48 hours notice, please.");

      const deleted = await owner.agent
        .delete(`/tenants/${tenantId}/knowledge/${itemId}`)
        .set("x-csrf-token", owner.csrfToken);
      expect(deleted.status).toBe(200);

      const listedAfterDelete = await owner.agent
        .get(`/tenants/${tenantId}/knowledge`)
        .set("x-csrf-token", owner.csrfToken);
      expect((listedAfterDelete.body as { id: string }[]).some((item) => item.id === itemId)).toBe(false);
    });
  });

  describe("DialogueStateMachine ask_question routing (A8.2, A8.3 grounding)", () => {
    let voiceGatewayPrisma: PrismaClient;
    let tenantId: string;
    let locationId: string;

    beforeAll(async () => {
      voiceGatewayPrisma = new PrismaClient({ datasources: { db: { url: process.env["DATABASE_URL"]! } } });
      const suffix = randomUUID().slice(0, 8);
      const tenant = await migratorPrisma.tenant.create({
        data: {
          legalName: `Grounding Test ${suffix}`,
          commercialRegistration: `CR-${suffix}`,
          status: "active",
          planCode: "test",
        },
      });
      const location = await migratorPrisma.location.create({
        data: { tenantId: tenant.id, name: "Main", addressLine: "x", timezone: "Asia/Riyadh", active: true },
      });

      // No staff/service/availability fixtures — ask_question never reaches
      // SlotCollection or AvailabilityCheck, so this suite only needs a
      // tenant and location for DialogueStateMachineDeps.

      await insertKnowledgeItem({
        tenantId: tenant.id,
        questionText: "What are your opening hours?",
        answerText: "We are open Sunday to Thursday, 9 AM to 5 PM.",
        language: "en",
      });
      await insertKnowledgeItem({
        tenantId: tenant.id,
        questionText: "How much does teeth whitening cost?",
        answerText: "Teeth whitening costs 450 SAR.",
        language: "en",
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
        contactPhoneE164: "+966502222222",
      });
    }

    function utterance(text: string): TurnEvent {
      return { kind: "utterance", text, confidence: 0.9, language: "en" };
    }

    it("A8.3: answers a matched question with only the retrieved record's text — no invented or unrelated facts", async () => {
      const machine = newMachine(await createCall());
      let result = machine.start();
      result = await machine.handleTurn(result.context, utterance("hello"));
      expect(result.context.state).toBe("IntentCapture");

      result = await machine.handleTurn(result.context, utterance("What are your opening hours?"));
      expect(result.assistantText).toBe("We are open Sunday to Thursday, 9 AM to 5 PM.");
      // Grounding: never leaks the *other* knowledge item's price into an unrelated answer.
      expect(result.assistantText).not.toContain("450");
      expect(result.context.state).toBe("IntentCapture");
      expect(result.callShouldEnd).toBe(false);
      expect(result.transferRequested).toBe(false);
    });

    it("A8.2: a question with no matching knowledge record states the answer is unavailable and offers escalation, with no drafted (or invented) answer", async () => {
      const machine = newMachine(await createCall());
      let result = machine.start();
      result = await machine.handleTurn(result.context, utterance("hello"));

      result = await machine.handleTurn(
        result.context,
        utterance("Is there a shuttle service from the airport to the clinic?"),
      );
      expect(result.context.state).toBe("Escalation");
      expect(result.transferRequested).toBe(true);
      // No drafted answer means no leaked facts from any stored knowledge item.
      expect(result.assistantText).not.toContain("450");
      expect(result.assistantText).not.toContain("9 AM");
      expect(result.assistantText.length).toBeGreaterThan(0);
    });
  });
});

import { randomUUID } from "node:crypto";
import { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { ProviderFailureError } from "@voice-receptionist/shared";
import { DialogueStateMachine } from "../../apps/voice-gateway/src/booking/dialogue-state-machine";
import type { LanguageModelProvider } from "../../apps/voice-gateway/src/providers/language-model.provider";
import { FixtureLanguageModelProvider } from "../../apps/voice-gateway/src/providers/fixture/language-model.fixture";
import {
  bootstrapApp,
  createTestTenant,
  loginAgent,
  migratorPrisma,
  resetAuthRateLimits,
  type AuthenticatedAgent,
  type TestTenantFixture,
} from "./fixtures";

/** Throws on every call — proves no provider method was ever invoked, since any call would surface as this rejection. */
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

describe("Usage and spend controls (Module 11)", () => {
  describe("A11.3: spend circuit breaker", () => {
    let voiceGatewayPrisma: PrismaClient;
    let tenantId: string;
    let locationId: string;

    beforeAll(async () => {
      voiceGatewayPrisma = new PrismaClient({ datasources: { db: { url: process.env["DATABASE_URL"]! } } });
    });

    afterAll(async () => {
      await voiceGatewayPrisma.$disconnect();
    });

    async function setUpTenant(): Promise<void> {
      const suffix = randomUUID().slice(0, 8);
      const tenant = await migratorPrisma.tenant.create({
        data: {
          legalName: `Spend Test ${suffix}`,
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

    it("a call is suspended (never reaches a provider) once accumulated spend crosses the configured cap, with one audit alert", async () => {
      await setUpTenant();
      const now = new Date();
      const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      await migratorPrisma.subscription.create({
        data: {
          tenantId,
          planCode: "test",
          includedMinutes: 100,
          periodStart: new Date("2020-01-01T00:00:00.000Z"),
          periodEnd: new Date("2099-01-01T00:00:00.000Z"),
          status: "active",
          costPerBillableMinuteCents: 10,
          monthlySpendCapCents: 500, // 50 minutes at 10 cents/minute
        },
      });
      // 60 billable minutes * 10 cents = 600 cents, already over the 500-cent cap.
      await migratorPrisma.usageRecord.create({
        data: { tenantId, periodStart, billableMinutes: 60, overageMinutes: 0 },
      });

      const callId = await createCall();
      const machine = new DialogueStateMachine({
        languageModel: new FailingLanguageModelProvider(),
        prisma: voiceGatewayPrisma,
        tenantId,
        locationId,
        callId,
        contactPhoneE164: "+966501112233",
      });

      const result = await machine.start();
      expect(["Escalation", "Closure"]).toContain(result.context.state);
      expect(result.assistantText.length).toBeGreaterThan(0);

      // A caller utterance against the resulting terminal state never reaches
      // dispatchTurn's provider calls either (FailingLanguageModelProvider
      // would throw if it were ever invoked anywhere in this path).
      await machine.handleTurn(result.context, {
        kind: "utterance",
        text: "hello?",
        confidence: 0.9,
        language: "en",
      });

      const call = await migratorPrisma.call.findUniqueOrThrow({ where: { id: callId } });
      expect(call.disposition).toBe("spend_limit_suspended");

      // A10.1: no caller speech was ever collected on this path, so consent was never marked.
      const consent = await migratorPrisma.consentRecord.findUniqueOrThrow({ where: { callId } });
      expect(consent.announcementPlayedAt).toBeNull();

      const subscription = await migratorPrisma.subscription.findFirstOrThrow({ where: { tenantId } });
      expect(subscription.spendCapBreachedAt).not.toBeNull();

      const alerts = await migratorPrisma.auditLog.findMany({
        where: { tenantId, action: "usage.spend_cap_breached" },
      });
      expect(alerts).toHaveLength(1);
      expect(alerts[0]!.actorPrincipalType).toBe("voice_gateway");
      expect(alerts[0]!.actorUserId).toBeNull();
    });

    it("a second call in the same breached period is also suspended, without a second audit alert", async () => {
      // Reuses the tenant/subscription state left behind by the previous test.
      const callId = await createCall();
      const machine = new DialogueStateMachine({
        languageModel: new FailingLanguageModelProvider(),
        prisma: voiceGatewayPrisma,
        tenantId,
        locationId,
        callId,
        contactPhoneE164: "+966501112244",
      });

      const result = await machine.start();
      expect(["Escalation", "Closure"]).toContain(result.context.state);

      const alerts = await migratorPrisma.auditLog.findMany({
        where: { tenantId, action: "usage.spend_cap_breached" },
      });
      expect(alerts).toHaveLength(1); // still just the one from the first breach
    });

    it("a call proceeds normally when accumulated spend is under the cap", async () => {
      await setUpTenant();
      await migratorPrisma.subscription.create({
        data: {
          tenantId,
          planCode: "test",
          includedMinutes: 1000,
          periodStart: new Date("2020-01-01T00:00:00.000Z"),
          periodEnd: new Date("2099-01-01T00:00:00.000Z"),
          status: "active",
          costPerBillableMinuteCents: 10,
          monthlySpendCapCents: 500,
        },
      });

      const callId = await createCall();
      const machine = new DialogueStateMachine({
        languageModel: new FixtureLanguageModelProvider(),
        prisma: voiceGatewayPrisma,
        tenantId,
        locationId,
        callId,
        contactPhoneE164: "+966501112255",
      });

      const result = await machine.start();
      expect(result.context.state).toBe("LanguageDetection");
      const consent = await migratorPrisma.consentRecord.findUniqueOrThrow({ where: { callId } });
      expect(consent.announcementPlayedAt).not.toBeNull();
    });

    it("a call proceeds normally when no spend cap is configured (monthlySpendCapCents is null)", async () => {
      await setUpTenant();
      await migratorPrisma.subscription.create({
        data: {
          tenantId,
          planCode: "test",
          includedMinutes: 10,
          periodStart: new Date("2020-01-01T00:00:00.000Z"),
          periodEnd: new Date("2099-01-01T00:00:00.000Z"),
          status: "active",
          costPerBillableMinuteCents: 1000,
          // monthlySpendCapCents intentionally omitted (null)
        },
      });
      const now = new Date();
      const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      await migratorPrisma.usageRecord.create({
        data: { tenantId, periodStart, billableMinutes: 9999, overageMinutes: 9989 },
      });

      const callId = await createCall();
      const machine = new DialogueStateMachine({
        languageModel: new FixtureLanguageModelProvider(),
        prisma: voiceGatewayPrisma,
        tenantId,
        locationId,
        callId,
        contactPhoneE164: "+966501112266",
      });

      const result = await machine.start();
      expect(result.context.state).toBe("LanguageDetection");
    });
  });

  describe("apps/api usage endpoint (RBAC)", () => {
    let app: INestApplication;
    let fixture: TestTenantFixture;
    let owner: AuthenticatedAgent;
    let manager: AuthenticatedAgent;
    let operator: AuthenticatedAgent;

    beforeAll(async () => {
      await resetAuthRateLimits();
      app = await bootstrapApp();
      fixture = await createTestTenant({
        owner: { role: "tenant_owner", password: "OwnerPassw0rd!123" },
        manager: { role: "location_manager", password: "ManagerPassw0rd!123" },
        operator: { role: "platform_operator", password: "OperatorPassw0rd!123" },
      });
      owner = await loginAgent(app, fixture.users["owner"]!);
      manager = await loginAgent(app, fixture.users["manager"]!);
      operator = await loginAgent(app, fixture.users["operator"]!);

      await migratorPrisma.subscription.create({
        data: {
          tenantId: fixture.tenantId,
          planCode: "growth",
          includedMinutes: 500,
          periodStart: new Date("2020-01-01T00:00:00.000Z"),
          periodEnd: new Date("2099-01-01T00:00:00.000Z"),
          status: "active",
        },
      });
    });

    afterAll(async () => {
      await app.close();
    });

    it("tenant_owner and platform_operator can read usage; location_manager cannot (403)", async () => {
      const ownerRes = await owner.agent
        .get(`/tenants/${fixture.tenantId}/usage`)
        .set("x-csrf-token", owner.csrfToken);
      expect(ownerRes.status).toBe(200);
      expect(ownerRes.body.subscription.planCode).toBe("growth");

      const operatorRes = await operator.agent
        .get(`/tenants/${fixture.tenantId}/usage`)
        .set("x-csrf-token", operator.csrfToken);
      expect(operatorRes.status).toBe(200);

      const managerRes = await manager.agent
        .get(`/tenants/${fixture.tenantId}/usage`)
        .set("x-csrf-token", manager.csrfToken);
      expect(managerRes.status).toBe(403);
    });
  });
});

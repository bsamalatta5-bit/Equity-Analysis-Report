import { randomInt, randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { PrismaClient } from "@prisma/client";
import * as argon2 from "argon2";
import { authenticator } from "otplib";
import { resetAuthRateLimit } from "./reset-rate-limit";

const prisma = new PrismaClient({
  datasources: { db: { url: process.env["DATABASE_MIGRATOR_URL"]! } },
});

interface Fixture {
  email: string;
  password: string;
  totpSecret: string;
  appointmentId: string;
  callId: string;
}

/**
 * A12.3 needs every screen scanned in both languages, not just the
 * screen-by-screen English-only coverage Module 12's earlier parts built up
 * incrementally. One rich tenant_owner fixture (a location, service, staff
 * member, appointment, and call-with-transcript) lets this file reach every
 * route — including the two id-addressed detail screens — without each
 * part's own spec file growing an Arabic pass of its own.
 */
async function seedFixture(): Promise<Fixture> {
  const suffix = randomUUID().slice(0, 8);
  const tenant = await prisma.tenant.create({
    data: {
      legalName: `E2E Sweep Clinic ${suffix}`,
      commercialRegistration: `CR-SWEEP-${suffix}`,
      status: "active",
      planCode: "test",
    },
  });
  const location = await prisma.location.create({
    data: {
      tenantId: tenant.id,
      name: "Main Branch",
      addressLine: "Test",
      timezone: "Asia/Riyadh",
      active: true,
    },
  });
  const service = await prisma.service.create({
    data: {
      locationId: location.id,
      nameAr: "تنظيف الأسنان",
      nameEn: "Teeth Cleaning",
      durationMinutes: 30,
      statedPrice: "100.00",
      active: true,
    },
  });
  const staffMember = await prisma.staffMember.create({
    data: { locationId: location.id, displayName: "Dr. Sweep", active: true },
  });

  const contactPhone = `+9665${randomInt(10000000, 99999999)}`;
  const contact = await prisma.contact.create({
    data: { tenantId: tenant.id, phoneE164: contactPhone, displayName: "Sweep Caller" },
  });

  const appointment = await prisma.appointment.create({
    data: {
      locationId: location.id,
      serviceId: service.id,
      staffMemberId: staffMember.id,
      contactId: contact.id,
      startAt: new Date(Date.now() + 60 * 60 * 1000),
      endAt: new Date(Date.now() + 90 * 60 * 1000),
      status: "confirmed",
      source: "dashboard",
    },
  });

  const call = await prisma.call.create({
    data: {
      tenantId: tenant.id,
      locationId: location.id,
      contactId: contact.id,
      direction: "inbound",
      startedAt: new Date(Date.now() - 60_000),
      endedAt: new Date(),
      disposition: "contained",
      containmentFlag: true,
    },
  });
  await prisma.consentRecord.create({
    data: { callId: call.id, recordingConsented: false, announcementPlayedAt: new Date(Date.now() - 60_000) },
  });
  await prisma.callTurn.create({
    data: {
      callId: call.id,
      sequence: 0,
      speaker: "caller",
      transcriptText: "I'd like to book an appointment.",
      occurredAt: new Date(Date.now() - 55_000),
    },
  });

  const now = new Date();
  await prisma.subscription.create({
    data: {
      tenantId: tenant.id,
      planCode: "growth",
      includedMinutes: 1000,
      periodStart: new Date(now.getFullYear(), now.getMonth(), 1),
      periodEnd: new Date(now.getFullYear(), now.getMonth() + 1, 0),
      status: "active",
    },
  });

  const password = "SweepOwnerPassw0rd!123";
  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
  const totpSecret = authenticator.generateSecret();
  const user = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: `owner-sweep-${suffix}@e2e.example`,
      passwordHash,
      role: "tenant_owner",
      status: "active",
      totpSecret,
      totpEnrolledAt: new Date(),
    },
  });

  return {
    email: user.email,
    password,
    totpSecret,
    appointmentId: appointment.id,
    callId: call.id,
  };
}

async function scanRoute(page: Page, path: string): Promise<void> {
  await page.goto(path);
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag22aa"]).analyze();
  expect(results.violations, `violations on ${path}`).toEqual([]);
}

async function signIn(page: Page, fixture: Fixture): Promise<void> {
  await page.goto("/en/sign-in");
  await page.getByLabel("Email").fill(fixture.email);
  await page.getByLabel("Password").fill(fixture.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/en\/verify\?/);
  await page.getByLabel("Verification code").fill(authenticator.generate(fixture.totpSecret));
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page).toHaveURL(/\/en$/);
}

test.describe("Module 12 part 6: full accessibility sweep, both languages (A12.3)", () => {
  let fixture: Fixture;

  test.beforeAll(async () => {
    await resetAuthRateLimit("127.0.0.1");
    fixture = await seedFixture();
  });

  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test("the sign-in and second-factor screens have zero violations in both languages", async ({ page }) => {
    for (const locale of ["en", "ar"] as const) {
      await scanRoute(page, `/${locale}/sign-in`);
    }

    // mode=verify (already-enrolled) renders without calling the API, so
    // viewing it in both languages never consumes or invalidates the token.
    await page.goto("/en/sign-in");
    await page.getByLabel("Email").fill(fixture.email);
    await page.getByLabel("Password").fill(fixture.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/en\/verify\?/);
    const verifyUrl = new URL(page.url());
    for (const locale of ["en", "ar"] as const) {
      await scanRoute(page, `/${locale}/verify${verifyUrl.search}`);
    }
  });

  test("every authenticated screen has zero violations in both languages", async ({ page }) => {
    await signIn(page, fixture);

    const routes = [
      "",
      "/onboarding",
      "/calendar",
      "/appointments/new",
      `/appointments/${fixture.appointmentId}`,
      "/calls",
      `/calls/${fixture.callId}`,
      "/knowledge",
      "/services",
      "/staff",
      "/escalation-rules",
      "/locations",
      "/users",
      "/usage",
      "/settings",
    ];

    for (const locale of ["en", "ar"] as const) {
      for (const route of routes) {
        await scanRoute(page, `/${locale}${route}`);
      }
    }
  });
});

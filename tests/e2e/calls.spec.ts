import { randomInt, randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { PrismaClient } from "@prisma/client";
import * as argon2 from "argon2";
import { authenticator } from "otplib";

const prisma = new PrismaClient({
  datasources: { db: { url: process.env["DATABASE_MIGRATOR_URL"]! } },
});

interface Fixture {
  email: string;
  password: string;
  phoneNumber: string;
}

async function seedFixture(): Promise<Fixture> {
  const suffix = randomUUID().slice(0, 8);
  const tenant = await prisma.tenant.create({
    data: {
      legalName: `E2E Calls Clinic ${suffix}`,
      commercialRegistration: `CR-CALLS-${suffix}`,
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
  const phoneNumber = `+9665${randomInt(10000000, 99999999)}`;
  const contact = await prisma.contact.create({
    data: { tenantId: tenant.id, phoneE164: phoneNumber, displayName: "Test Caller" },
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
      transcriptText: "I'd like to book an appointment for tomorrow.",
      occurredAt: new Date(Date.now() - 55_000),
    },
  });
  await prisma.callTurn.create({
    data: {
      callId: call.id,
      sequence: 1,
      speaker: "assistant",
      transcriptText: "Sure — what service are you looking for?",
      occurredAt: new Date(Date.now() - 50_000),
    },
  });

  const password = "LocationManagerPassw0rd!123";
  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
  const totpSecret = "JBSWY3DPEHPK3PXP";
  const user = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: `location-manager-calls-${suffix}@e2e.example`,
      passwordHash,
      role: "location_manager",
      status: "active",
      totpSecret,
      totpEnrolledAt: new Date(),
    },
  });
  await prisma.userLocation.create({ data: { userId: user.id, locationId: location.id } });

  return { email: user.email, password, phoneNumber };
}

test.describe("Call log and call detail (Module 12)", () => {
  let fixture: Fixture;

  test.beforeAll(async () => {
    fixture = await seedFixture();
  });

  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  async function signInWithTotp(page: import("@playwright/test").Page): Promise<void> {
    await page.goto("/en/sign-in");
    await page.getByLabel("Email").fill(fixture.email);
    await page.getByLabel("Password").fill(fixture.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/en\/verify\?/);
    await page.getByLabel("Verification code").fill(authenticator.generate("JBSWY3DPEHPK3PXP"));
    await page.getByRole("button", { name: "Verify" }).click();
    await expect(page).toHaveURL(/\/en$/);
  }

  test("the call log masks the caller's number, while the detail screen shows it unmasked alongside the transcript", async ({
    page,
  }) => {
    await signInWithTotp(page);

    await page.goto("/en/calls");
    const maskedTail = fixture.phoneNumber.slice(-4);
    const callLink = page.getByRole("link", { name: new RegExp(maskedTail) });
    await expect(callLink).toBeVisible();
    await expect(page.getByText(fixture.phoneNumber, { exact: true })).toHaveCount(0);

    await callLink.click();
    await expect(page).toHaveURL(/\/en\/calls\/[0-9a-f-]+$/);
    await expect(page.getByText(fixture.phoneNumber, { exact: true })).toBeVisible();

    await expect(page.getByText("I'd like to book an appointment for tomorrow.")).toBeVisible();
    await expect(page.getByText("Sure — what service are you looking for?")).toBeVisible();
    await expect(page.getByText(/^Caller ·/)).toBeVisible();
    await expect(page.getByText(/^Assistant ·/)).toBeVisible();

    // No recording was ever created for this call.
    await expect(page.getByText("No recording is available for this call.")).toBeVisible();
  });

  test("the call log and call detail screens have zero automatically detectable WCAG 2.2 AA violations", async ({
    page,
  }) => {
    await signInWithTotp(page);

    await page.goto("/en/calls");
    const logResults = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag22aa"]).analyze();
    expect(logResults.violations).toEqual([]);

    await page.getByRole("link", { name: new RegExp(fixture.phoneNumber.slice(-4)) }).click();
    await expect(page).toHaveURL(/\/en\/calls\/[0-9a-f-]+$/);
    const detailResults = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag22aa"])
      .analyze();
    expect(detailResults.violations).toEqual([]);
  });
});

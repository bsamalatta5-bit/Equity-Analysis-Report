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
  totpSecret: string;
  locationName: string;
}

async function seedFixture(): Promise<Fixture> {
  const suffix = randomUUID().slice(0, 8);
  const tenant = await prisma.tenant.create({
    data: {
      legalName: `E2E Catalog Clinic ${suffix}`,
      commercialRegistration: `CR-CATALOG-${suffix}`,
      status: "active",
      planCode: "test",
    },
  });
  const locationName = `Main Branch ${suffix}`;
  const location = await prisma.location.create({
    data: {
      tenantId: tenant.id,
      name: locationName,
      addressLine: "Test",
      timezone: "Asia/Riyadh",
      active: true,
    },
  });

  const password = "OwnerCatalogPassw0rd!123";
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
      email: `owner-catalog-${suffix}@e2e.example`,
      passwordHash,
      role: "tenant_owner",
      status: "active",
      totpSecret,
      totpEnrolledAt: new Date(),
    },
  });
  await prisma.userLocation.create({ data: { userId: user.id, locationId: location.id } });

  return { email: user.email, password, totpSecret, locationName };
}

test.describe("Knowledge base, catalog, staff, escalation, and location screens (Module 12)", () => {
  let fixture: Fixture;

  test.beforeAll(async () => {
    fixture = await seedFixture();
  });

  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test.beforeEach(async ({ page }) => {
    await page.goto("/en/sign-in");
    await page.getByLabel("Email").fill(fixture.email);
    await page.getByLabel("Password").fill(fixture.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/en\/verify\?/);
    await page.getByLabel("Verification code").fill(authenticator.generate(fixture.totpSecret));
    await page.getByRole("button", { name: "Verify" }).click();
    await expect(page).toHaveURL(/\/en$/);
  });

  test("a tenant_owner can add a knowledge item, a service, a staff member with availability, an escalation rule, and a phone number", async ({
    page,
  }) => {
    // Knowledge base
    await page.goto("/en/knowledge");
    await page.getByRole("button", { name: "Add knowledge item" }).click();
    await page.getByLabel("Question").fill("What are your opening hours?");
    await page.getByLabel("Answer").fill("We are open from 9am to 9pm, Saturday to Thursday.");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("What are your opening hours?")).toBeVisible();

    // Service catalog
    await page.goto("/en/services");
    await page.getByRole("button", { name: "Add service" }).click();
    await page.getByLabel("Service name (Arabic)").fill("تنظيف الأسنان");
    await page.getByLabel("Service name (English)").fill("Teeth Cleaning");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Teeth Cleaning")).toBeVisible();

    // Staff and availability
    await page.goto("/en/staff");
    await page.getByRole("button", { name: "Add staff member" }).click();
    await page.getByLabel("Staff member name").fill("Dr. Catalog Test");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Dr. Catalog Test")).toBeVisible();

    await page.getByRole("button", { name: "Manage availability" }).click();
    await expect(page.getByText("No availability rules yet.")).toBeVisible();
    await page.getByRole("button", { name: "Add availability" }).click();
    await expect(page.getByText(/^Sunday /)).toBeVisible();

    // Escalation rules
    await page.goto("/en/escalation-rules");
    await page.getByRole("button", { name: "Add escalation rule" }).click();
    await page.getByLabel("Transfer to phone number").fill("+966501112233");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("+966501112233")).toBeVisible();
    await expect(page.getByText("Caller asked for a person")).toBeVisible();

    // Location management: edit the seeded location and connect a phone number
    await page.goto("/en/locations");
    await expect(page.getByText(fixture.locationName)).toBeVisible();
    await page.getByRole("button", { name: "Phone numbers" }).click();
    await expect(page.getByText("No phone numbers connected yet.")).toBeVisible();
    // e164Number is globally unique — a fixed literal would collide on a repeat run.
    const phoneNumber = `+9665${randomInt(10000000, 99999999)}`;
    await page.getByLabel("Phone number (E.164)").fill(phoneNumber);
    await page.getByLabel("Telephony provider reference").fill("test-provider-ref");
    await page.getByRole("button", { name: "Connect a phone number" }).click();
    await expect(page.getByText(phoneNumber)).toBeVisible();
  });

  test("the knowledge base, service catalog, staff, escalation rules, and locations screens have zero automatically detectable WCAG 2.2 AA violations", async ({
    page,
  }) => {
    for (const path of [
      "/en/knowledge",
      "/en/services",
      "/en/staff",
      "/en/escalation-rules",
      "/en/locations",
    ]) {
      await page.goto(path);
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag22aa"]).analyze();
      expect(results.violations, `violations on ${path}`).toEqual([]);
    }
  });
});

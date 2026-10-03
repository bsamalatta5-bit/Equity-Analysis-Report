import { randomInt, randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
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
  locationName: string;
}

async function seedFixture(): Promise<Fixture> {
  const suffix = randomUUID().slice(0, 8);
  const tenant = await prisma.tenant.create({
    data: {
      legalName: `E2E Account Mgmt Clinic ${suffix}`,
      commercialRegistration: `CR-ACCOUNT-${suffix}`,
      status: "active",
      planCode: "test",
    },
  });
  const locationName = `Main Branch ${suffix}`;
  await prisma.location.create({
    data: {
      tenantId: tenant.id,
      name: locationName,
      addressLine: "Test",
      timezone: "Asia/Riyadh",
      active: true,
    },
  });

  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  await prisma.subscription.create({
    data: {
      tenantId: tenant.id,
      planCode: "growth",
      includedMinutes: 1000,
      periodStart,
      periodEnd,
      status: "active",
      monthlySpendCapCents: 500000,
    },
  });
  await prisma.usageRecord.create({
    data: { tenantId: tenant.id, periodStart, billableMinutes: 42, overageMinutes: 0 },
  });

  const password = "OwnerAccountPassw0rd!123";
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
      email: `owner-account-${suffix}@e2e.example`,
      passwordHash,
      role: "tenant_owner",
      status: "active",
      totpSecret,
      totpEnrolledAt: new Date(),
    },
  });

  return { email: user.email, password, totpSecret, locationName };
}

test.describe("User management, usage/billing, and account settings screens (Module 12)", () => {
  let fixture: Fixture;

  test.beforeAll(async () => {
    await resetAuthRateLimit("127.0.0.1");
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

  test("a tenant_owner can add, edit, and disable a user", async ({ page }) => {
    const suffix = randomInt(10000000, 99999999);
    const newUserEmail = `front-desk-${suffix}@e2e.example`;

    await page.goto("/en/users");
    await page.getByRole("button", { name: "Add user" }).click();
    await page.getByLabel("Email").fill(newUserEmail);
    await page.getByRole("button", { name: "Save" }).click();

    await expect(page.getByText("Share this temporary password")).toBeVisible();
    await expect(page.getByText(newUserEmail)).toBeVisible();
    await page.getByRole("button", { name: "Close" }).click();

    const userRow = page.locator("div.flex.items-center.justify-between", { hasText: newUserEmail });
    await userRow.getByRole("button", { name: "Edit" }).click();
    await page.getByLabel("Role").selectOption("location_manager");
    await page.getByLabel(fixture.locationName).check();
    await page.getByRole("button", { name: "Save" }).click();

    await expect(page.getByText("Location manager")).toBeVisible();

    const updatedRow = page.locator("div.flex.items-center.justify-between", { hasText: newUserEmail });
    await updatedRow.getByRole("button", { name: "Disable" }).click();
    await expect(updatedRow.getByText("Disabled")).toBeVisible();
  });

  test("a tenant_owner can view usage and billing summary", async ({ page }) => {
    await page.goto("/en/usage");
    await expect(page.getByText("growth")).toBeVisible();
    await expect(page.getByText("1000")).toBeVisible();
    await expect(page.getByText("42")).toBeVisible();
  });

  test("a tenant_owner can change their password and update clinic details", async ({ page }) => {
    await page.goto("/en/settings");

    const newPassword = "ANewOwnerPassw0rd!456";
    await page.getByLabel("Current password").fill(fixture.password);
    await page.getByLabel("New password").fill(newPassword);
    await page.getByRole("button", { name: "Change password" }).click();
    await expect(page.getByText("Your password has been changed.")).toBeVisible();
    // The real password just changed in the database — later tests in this file sign in again.
    fixture.password = newPassword;

    const updatedLegalName = `Updated Clinic Name ${randomInt(1000, 9999)}`;
    await page.getByLabel("Legal name").fill(updatedLegalName);
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Saved.")).toBeVisible();
  });

  test("the users, usage, and settings screens have zero automatically detectable WCAG 2.2 AA violations", async ({
    page,
  }) => {
    for (const path of ["/en/users", "/en/usage", "/en/settings"]) {
      await page.goto(path);
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag22aa"]).analyze();
      expect(results.violations, `violations on ${path}`).toEqual([]);
    }
  });
});

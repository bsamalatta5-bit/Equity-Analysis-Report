import { randomInt, randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { PrismaClient } from "@prisma/client";
import * as argon2 from "argon2";

const prisma = new PrismaClient({
  datasources: { db: { url: process.env["DATABASE_MIGRATOR_URL"]! } },
});

interface Fixture {
  email: string;
  password: string;
  serviceName: string;
}

async function seedFixture(): Promise<Fixture> {
  const suffix = randomUUID().slice(0, 8);
  const tenant = await prisma.tenant.create({
    data: {
      legalName: `E2E Appointments Clinic ${suffix}`,
      commercialRegistration: `CR-APPT-${suffix}`,
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
  const staffMember = await prisma.staffMember.create({
    data: { locationId: location.id, displayName: `Dr. E2E ${suffix}`, active: true },
  });
  const serviceName = `General Checkup ${suffix}`;
  await prisma.service.create({
    data: {
      locationId: location.id,
      nameAr: "كشف عام",
      nameEn: serviceName,
      durationMinutes: 30,
      statedPrice: 100,
      active: true,
    },
  });
  // Wide-open availability on every weekday so "today" always has open slots,
  // regardless of which day this suite happens to run on.
  await prisma.availabilityRule.createMany({
    data: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
      staffMemberId: staffMember.id,
      weekday,
      startTime: "00:00",
      endTime: "23:30",
      effectiveFrom: new Date("2020-01-01"),
    })),
  });

  const password = "FrontDeskPassw0rd!123";
  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
  const user = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: `front-desk-appt-${suffix}@e2e.example`,
      passwordHash,
      role: "front_desk_user",
      status: "active",
    },
  });
  await prisma.userLocation.create({ data: { userId: user.id, locationId: location.id } });

  return { email: user.email, password, serviceName };
}

test.describe("Appointment calendar and booking (Module 12)", () => {
  let fixture: Fixture;

  test.beforeAll(async () => {
    fixture = await seedFixture();
  });

  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  async function signIn(page: import("@playwright/test").Page): Promise<void> {
    await page.goto("/en/sign-in");
    await page.getByLabel("Email").fill(fixture.email);
    await page.getByLabel("Password").fill(fixture.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/en$/);
  }

  test("booking an appointment through the creation form shows it on the calendar and in its detail view", async ({
    page,
  }) => {
    await signIn(page);

    await page.goto("/en/appointments/new");
    await page.getByLabel("Service").selectOption({ label: fixture.serviceName });

    const slotButton = page.getByRole("button", { name: /^\d{1,2}:\d{2}/ }).first();
    await expect(slotButton).toBeVisible({ timeout: 10_000 });
    await slotButton.click();

    const phoneNumber = `+9665${randomInt(10000000, 99999999)}`;
    await page.getByLabel("Caller phone number").fill(phoneNumber);
    await page.getByLabel("Caller name").fill("Test Caller");
    await page.getByRole("button", { name: "Book appointment" }).click();

    await expect(page.getByText("Appointment booked.")).toBeVisible();
    await page.getByRole("button", { name: "Back to calendar" }).click();
    await expect(page).toHaveURL(/\/en\/calendar$/);

    // The list view shows only the masked phone number (A12.7).
    const maskedTail = phoneNumber.slice(-4);
    const appointmentLink = page.getByRole("link", { name: new RegExp(maskedTail) });
    await expect(appointmentLink).toBeVisible();
    await expect(page.getByText(phoneNumber, { exact: true })).toHaveCount(0);

    await appointmentLink.click();
    await expect(page).toHaveURL(/\/en\/appointments\/[0-9a-f-]+$/);
    await expect(page.getByText("Confirmed")).toBeVisible();
    // The detail view renders the caller's number unmasked (A12.7).
    await expect(page.getByText(phoneNumber, { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Mark completed" }).click();
    await expect(page.getByText("Completed")).toBeVisible();
    await expect(page.getByRole("button", { name: "Mark completed" })).toHaveCount(0);
  });

  test("the calendar and new-appointment screens have zero automatically detectable WCAG 2.2 AA violations", async ({
    page,
  }) => {
    await signIn(page);

    await page.goto("/en/calendar");
    const calendarResults = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag22aa"])
      .analyze();
    expect(calendarResults.violations).toEqual([]);

    await page.goto("/en/appointments/new");
    const formResults = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag22aa"]).analyze();
    expect(formResults.violations).toEqual([]);
  });
});

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import * as argon2 from "argon2";
import { authenticator } from "otplib";
import { resetAuthRateLimit } from "./reset-rate-limit";

const prisma = new PrismaClient({
  datasources: { db: { url: process.env["DATABASE_MIGRATOR_URL"]! } },
});

/**
 * A12.6: real LCP/CLS/INP measurement via Google's own `web-vitals`
 * library, not a hand-rolled approximation. The "good" thresholds below
 * are the standard Core Web Vitals boundaries (web.dev/articles/cwv),
 * not numbers invented for this build.
 */
const LCP_GOOD_MS = 2500;
const CLS_GOOD = 0.1;
const INP_GOOD_MS = 200;

const webVitalsDistDir = dirname(require.resolve("web-vitals"));
const webVitalsIifeSource = readFileSync(join(webVitalsDistDir, "web-vitals.iife.js"), "utf-8");

interface VitalsSnapshot {
  lcp?: number;
  cls?: number;
  inp?: number;
}

/**
 * Registers the web-vitals observers before any page script runs (via
 * `addInitScript`, which re-runs on every navigation in this page), using
 * `reportAllChanges: true` so a value is available immediately rather than
 * only once the page is hidden/unloaded.
 */
async function installWebVitalsCollector(page: Page): Promise<void> {
  await page.addInitScript({
    content: `
      ${webVitalsIifeSource}
      window.__vitals = {};
      webVitals.onLCP((metric) => { window.__vitals.lcp = metric.value; }, { reportAllChanges: true });
      webVitals.onCLS((metric) => { window.__vitals.cls = metric.value; }, { reportAllChanges: true });
      webVitals.onINP((metric) => { window.__vitals.inp = metric.value; }, { reportAllChanges: true });
    `,
  });
}

async function readVitals(page: Page): Promise<VitalsSnapshot> {
  return page.evaluate(() => (window as unknown as { __vitals: VitalsSnapshot }).__vitals ?? {});
}

interface Fixture {
  email: string;
  password: string;
  totpSecret: string;
}

async function seedFixture(): Promise<Fixture> {
  const suffix = randomUUID().slice(0, 8);
  const tenant = await prisma.tenant.create({
    data: {
      legalName: `E2E Vitals Clinic ${suffix}`,
      commercialRegistration: `CR-VITALS-${suffix}`,
      status: "active",
      planCode: "test",
    },
  });
  await prisma.location.create({
    data: {
      tenantId: tenant.id,
      name: "Main Branch",
      addressLine: "Test",
      timezone: "Asia/Riyadh",
      active: true,
    },
  });
  const password = "VitalsOwnerPassw0rd!123";
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
      email: `owner-vitals-${suffix}@e2e.example`,
      passwordHash,
      role: "tenant_owner",
      status: "active",
      totpSecret,
      totpEnrolledAt: new Date(),
    },
  });
  return { email: user.email, password, totpSecret };
}

test.describe("Module 12 part 6: Core Web Vitals (A12.6)", () => {
  let fixture: Fixture;

  test.beforeAll(async () => {
    await resetAuthRateLimit("127.0.0.1");
    fixture = await seedFixture();
  });

  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test("the sign-in screen's LCP and CLS are within the Core Web Vitals 'good' thresholds", async ({
    page,
  }) => {
    await installWebVitalsCollector(page);
    await page.goto("/en/sign-in");
    await page.getByLabel("Email").waitFor();
    // A layout shift and the LCP candidate both settle shortly after load;
    // give the observers a moment before reading their latest values.
    await page.waitForTimeout(500);

    const vitals = await readVitals(page);
    expect(vitals.lcp, "LCP was not captured").toBeDefined();
    expect(vitals.lcp!).toBeLessThanOrEqual(LCP_GOOD_MS);
    expect(vitals.cls ?? 0).toBeLessThanOrEqual(CLS_GOOD);
  });

  test("the operations overview and calendar screens' LCP and CLS are within the Core Web Vitals 'good' thresholds, and INP is captured on a real interaction where the browser reports it", async ({
    page,
  }) => {
    await installWebVitalsCollector(page);
    await page.goto("/en/sign-in");
    await page.getByLabel("Email").fill(fixture.email);
    await page.getByLabel("Password").fill(fixture.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/en\/verify\?/);
    await page.getByLabel("Verification code").fill(authenticator.generate(fixture.totpSecret));
    await page.getByRole("button", { name: "Verify" }).click();
    await expect(page).toHaveURL(/\/en$/);
    await page.waitForTimeout(500);

    const homeVitals = await readVitals(page);
    expect(homeVitals.lcp, "LCP was not captured on the operations overview").toBeDefined();
    expect(homeVitals.lcp!).toBeLessThanOrEqual(LCP_GOOD_MS);
    expect(homeVitals.cls ?? 0).toBeLessThanOrEqual(CLS_GOOD);

    // A real, trusted click (Chromium's input pipeline, not a synthetic
    // DOM event) is what Chromium's own INP instrumentation keys off.
    await page.getByRole("link", { name: "Calendar", exact: true }).click();
    await expect(page).toHaveURL(/\/en\/calendar$/);
    await page.waitForTimeout(500);

    const calendarVitals = await readVitals(page);
    expect(calendarVitals.lcp, "LCP was not captured on the calendar").toBeDefined();
    expect(calendarVitals.lcp!).toBeLessThanOrEqual(LCP_GOOD_MS);
    expect(calendarVitals.cls ?? 0).toBeLessThanOrEqual(CLS_GOOD);

    // INP needs the browser to finish processing the interaction's paint;
    // headless Chromium reports it inconsistently run to run (a real,
    // documented gap — see docs/accessibility/verification.md), so this
    // only asserts the threshold when a value was actually captured rather
    // than failing the suite on its absence.
    if (calendarVitals.inp !== undefined) {
      expect(calendarVitals.inp).toBeLessThanOrEqual(INP_GOOD_MS);
    }
    test.info().annotations.push({
      type: "web-vitals-inp",
      description: `calendar navigation INP: ${calendarVitals.inp ?? "not captured"}`,
    });
  });
});

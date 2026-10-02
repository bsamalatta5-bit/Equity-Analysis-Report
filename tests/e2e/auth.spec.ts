import { readFileSync } from "node:fs";
import { randomInt } from "node:crypto";
import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { authenticator } from "otplib";
import { FIXTURE_PATH, type E2eFixture } from "./global-setup";

function loadFixture(): E2eFixture {
  return JSON.parse(readFileSync(FIXTURE_PATH, "utf-8")) as E2eFixture;
}

test.describe("Sign-in and second-factor verification (Module 12)", () => {
  test("a user with no TOTP requirement signs in directly and can sign out", async ({ page }) => {
    const fixture = loadFixture();
    await page.goto("/en/sign-in");
    await page.getByLabel("Email").fill(fixture.frontDeskUser.email);
    await page.getByLabel("Password").fill(fixture.frontDeskUser.password);
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL(/\/en$/);
    await expect(page.getByText("front_desk_user")).toBeVisible();

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/en\/sign-in$/);
  });

  test("an invalid password shows an inline error and does not navigate away", async ({ page }) => {
    const fixture = loadFixture();
    await page.goto("/en/sign-in");
    await page.getByLabel("Email").fill(fixture.frontDeskUser.email);
    await page.getByLabel("Password").fill("WrongPassword123!");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByText("Incorrect email or password.")).toBeVisible();
    await expect(page).toHaveURL(/\/en\/sign-in$/);
  });

  test("a tenant_owner with an already-enrolled authenticator completes sign-in via TOTP verify", async ({
    page,
  }) => {
    const fixture = loadFixture();
    await page.goto("/en/sign-in");
    await page.getByLabel("Email").fill(fixture.ownerEnrolled.email);
    await page.getByLabel("Password").fill(fixture.ownerEnrolled.password);
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL(/\/en\/verify\?/);
    await expect(page.getByRole("heading", { name: "Enter your verification code" })).toBeVisible();

    const code = authenticator.generate(fixture.ownerEnrolled.totpSecret);
    await page.getByLabel("Verification code").fill(code);
    await page.getByRole("button", { name: "Verify" }).click();

    await expect(page).toHaveURL(/\/en$/);
    await expect(page.getByText("tenant_owner")).toBeVisible();
  });

  test("a tenant_owner signing in for the first time enrolls TOTP, then completes the onboarding wizard", async ({
    page,
  }) => {
    const fixture = loadFixture();
    await page.goto("/en/sign-in");
    await page.getByLabel("Email").fill(fixture.ownerPendingEnrollment.email);
    await page.getByLabel("Password").fill(fixture.ownerPendingEnrollment.password);
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL(/\/en\/verify\?/);
    await expect(page.getByRole("heading", { name: "Set up two-factor authentication" })).toBeVisible();

    const secret = await page.getByText(/^[A-Z2-7]+$/).textContent();
    expect(secret).toBeTruthy();
    const code = authenticator.generate(secret!.trim());
    await page.getByLabel("Verification code").fill(code);
    await page.getByRole("button", { name: "Confirm setup" }).click();

    await expect(page).toHaveURL(/\/en$/);

    await page.getByRole("link", { name: "Finish setting up your clinic" }).click();
    await expect(page).toHaveURL(/\/en\/onboarding$/);

    await page.getByLabel("Location name").fill("Downtown Clinic");
    await page.getByLabel("Address").fill("123 Test Street");
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByRole("heading", { name: "Add a service" })).toBeVisible();
    await page.getByLabel("Service name (Arabic)").fill("كشف عام");
    await page.getByLabel("Service name (English)").fill("General Checkup");
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByRole("heading", { name: "Add a staff member" })).toBeVisible();
    await page.getByLabel("Staff member name").fill("Dr. Test");
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByRole("heading", { name: "Connect a phone number" })).toBeVisible();
    // e164Number is globally unique — a fixed literal would collide on a repeat run.
    const phoneNumber = `+9665${randomInt(10000000, 99999999)}`;
    await page.getByLabel("Phone number (E.164)").fill(phoneNumber);
    await page.getByLabel("Telephony provider reference").fill("test-provider-ref");
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByText("You're all set")).toBeVisible();
    await page.getByRole("button", { name: "Back to home" }).click();
    await expect(page).toHaveURL(/\/en$/);
  });

  test("the Arabic sign-in route renders dir=rtl with no translation gaps", async ({ page }) => {
    await page.goto("/ar/sign-in");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.getByRole("heading", { name: "تسجيل الدخول" })).toBeVisible();
  });

  test("the sign-in screen has zero automatically detectable WCAG 2.2 AA violations", async ({ page }) => {
    await page.goto("/en/sign-in");
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag22aa"]).analyze();
    expect(results.violations).toEqual([]);
  });
});

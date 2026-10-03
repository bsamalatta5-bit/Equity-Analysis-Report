/**
 * k6 scripts run in k6's own Goja JS engine, not Node — they cannot
 * `import` Prisma. This is the Node-side half: a one-shot seed run with
 * `tsx` before `k6 run`, writing the fixture `dashboard-read-load.js`
 * reads via `open()` at its own init time. See tests/load/README.md for
 * the exact two-command sequence.
 */
import { randomInt, randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import * as argon2 from "argon2";

const prisma = new PrismaClient({
  datasources: { db: { url: process.env["DATABASE_MIGRATOR_URL"]! } },
});

const FIXTURE_PATH = join(__dirname, ".fixture.json");

async function main(): Promise<void> {
  const suffix = randomUUID().slice(0, 8);
  const tenant = await prisma.tenant.create({
    data: {
      legalName: `Load Test Clinic ${suffix}`,
      commercialRegistration: `CR-LOAD-${suffix}`,
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

  // front_desk_user needs no TOTP enrollment (Module 3) — a k6 script has
  // no TOTP library available, so this role is the only one that can
  // reach an authenticated session with a single POST /auth/login.
  const password = "LoadTestFrontDeskPassw0rd!123";
  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
  const user = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: `load-test-${suffix}@load.example`,
      passwordHash,
      role: "front_desk_user",
      status: "active",
    },
  });
  await prisma.userLocation.create({ data: { userId: user.id, locationId: location.id } });

  // A handful of real calls so GET /tenants/:id/calls has something to
  // page through under load, instead of measuring only the empty-result path.
  for (let i = 0; i < 20; i += 1) {
    const phone = `+9665${randomInt(10000000, 99999999)}`;
    const contact = await prisma.contact.create({
      data: { tenantId: tenant.id, phoneE164: phone, displayName: `Load Test Caller ${i}` },
    });
    await prisma.call.create({
      data: {
        tenantId: tenant.id,
        locationId: location.id,
        contactId: contact.id,
        direction: "inbound",
        startedAt: new Date(Date.now() - (i + 1) * 60_000),
        endedAt: new Date(Date.now() - i * 60_000),
        disposition: "contained",
        containmentFlag: true,
      },
    });
  }

  const fixture = { email: user.email, password, tenantId: tenant.id, locationId: location.id };
  writeFileSync(FIXTURE_PATH, JSON.stringify(fixture, null, 2));
  // eslint-disable-next-line no-console -- a CLI seed script's intended output, not an app logging path.
  console.log(`Seeded load-test fixture -> ${FIXTURE_PATH}`, fixture);
}

main()
  .catch((err: unknown) => {
    // eslint-disable-next-line no-console -- a CLI seed script's intended output, not an app logging path.
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());

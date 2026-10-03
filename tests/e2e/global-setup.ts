import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import * as argon2 from "argon2";
import { authenticator } from "otplib";

async function hashPassword(plaintext: string): Promise<string> {
  return argon2.hash(plaintext, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
}

export interface E2eFixture {
  readonly frontDeskUser: { email: string; password: string };
  readonly ownerPendingEnrollment: { email: string; password: string };
  readonly ownerEnrolled: { email: string; password: string; totpSecret: string };
}

export const FIXTURE_PATH = join(__dirname, ".fixture-output.json");

/**
 * Runs once before the e2e suite: seeds one tenant with three users
 * covering every sign-in path the auth screens need to prove for real —
 * no-2FA, first-time TOTP enrollment, and already-enrolled TOTP — then
 * writes their credentials to a file the spec files read synchronously.
 */
export default async function globalSetup(): Promise<void> {
  const prisma = new PrismaClient({
    datasources: { db: { url: process.env["DATABASE_MIGRATOR_URL"]! } },
  });
  try {
    const suffix = randomUUID().slice(0, 8);
    const tenant = await prisma.tenant.create({
      data: {
        legalName: `E2E Clinic ${suffix}`,
        commercialRegistration: `CR-E2E-${suffix}`,
        status: "active",
        planCode: "test",
      },
    });
    await prisma.location.create({
      data: {
        tenantId: tenant.id,
        name: "Main Branch",
        addressLine: "Test Address",
        timezone: "Asia/Riyadh",
        active: true,
      },
    });

    const frontDeskPassword = "FrontDeskPassw0rd!123";
    const frontDeskUser = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: `front-desk-${suffix}@e2e.example`,
        passwordHash: await hashPassword(frontDeskPassword),
        role: "front_desk_user",
        status: "active",
      },
    });
    await prisma.userLocation.create({
      data: {
        userId: frontDeskUser.id,
        locationId: (await prisma.location.findFirstOrThrow({ where: { tenantId: tenant.id } })).id,
      },
    });

    const ownerPendingPassword = "OwnerPendingPassw0rd!123";
    await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: `owner-pending-${suffix}@e2e.example`,
        passwordHash: await hashPassword(ownerPendingPassword),
        role: "tenant_owner",
        status: "active",
      },
    });

    const ownerEnrolledPassword = "OwnerEnrolledPassw0rd!123";
    const ownerEnrolledTotpSecret = authenticator.generateSecret();
    await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: `owner-enrolled-${suffix}@e2e.example`,
        passwordHash: await hashPassword(ownerEnrolledPassword),
        role: "tenant_owner",
        status: "active",
        totpSecret: ownerEnrolledTotpSecret,
        totpEnrolledAt: new Date(),
      },
    });

    const fixture: E2eFixture = {
      frontDeskUser: { email: frontDeskUser.email, password: frontDeskPassword },
      ownerPendingEnrollment: {
        email: `owner-pending-${suffix}@e2e.example`,
        password: ownerPendingPassword,
      },
      ownerEnrolled: {
        email: `owner-enrolled-${suffix}@e2e.example`,
        password: ownerEnrolledPassword,
        totpSecret: ownerEnrolledTotpSecret,
      },
    };
    writeFileSync(FIXTURE_PATH, JSON.stringify(fixture, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

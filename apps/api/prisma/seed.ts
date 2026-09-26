import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import * as argon2 from "argon2";
import { authenticator } from "otplib";
import { computeHashingEmbedding, toVectorLiteral, THRESHOLDS } from "@voice-receptionist/shared";

const prisma = new PrismaClient();

async function hashPassword(plaintext: string): Promise<string> {
  return argon2.hash(plaintext, {
    type: argon2.argon2id,
    memoryCost: THRESHOLDS.ARGON2_MEMORY_COST_KIB,
    timeCost: THRESHOLDS.ARGON2_TIME_COST,
    parallelism: THRESHOLDS.ARGON2_PARALLELISM,
  });
}

async function main(): Promise<void> {
  const tenant = await prisma.tenant.create({
    data: {
      legalName: "Al Riyadh Smile Dental Clinic",
      commercialRegistration: "CR-1010101010",
      status: "active",
      planCode: "growth",
    },
  });

  const location = await prisma.location.create({
    data: {
      tenantId: tenant.id,
      name: "Al Olaya Branch",
      addressLine: "King Fahd Road, Al Olaya, Riyadh",
      timezone: "Asia/Riyadh",
      active: true,
    },
  });

  await prisma.phoneNumber.create({
    data: {
      tenantId: tenant.id,
      locationId: location.id,
      e164Number: "+966115550100",
      providerReference: "seed-placeholder-provider-ref",
      status: "active",
    },
  });

  const [ownerPasswordHash, frontDeskPasswordHash] = await Promise.all([
    hashPassword("dev-only-owner-password-change-me"),
    hashPassword("dev-only-frontdesk-password-change-me"),
  ]);

  const owner = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: "owner@al-riyadh-smile.example",
      passwordHash: ownerPasswordHash,
      role: "tenant_owner",
      status: "active",
      totpSecret: authenticator.generateSecret(),
      totpEnrolledAt: new Date(),
    },
  });

  const frontDesk = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: "frontdesk@al-riyadh-smile.example",
      passwordHash: frontDeskPasswordHash,
      role: "front_desk_user",
      status: "active",
    },
  });

  await prisma.userLocation.createMany({
    data: [
      { userId: owner.id, locationId: location.id },
      { userId: frontDesk.id, locationId: location.id },
    ],
  });

  const [cleaning, checkup] = await Promise.all([
    prisma.service.create({
      data: {
        locationId: location.id,
        nameAr: "تنظيف الأسنان",
        nameEn: "Dental Cleaning",
        durationMinutes: 30,
        statedPrice: 150,
        active: true,
      },
    }),
    prisma.service.create({
      data: {
        locationId: location.id,
        nameAr: "فحص عام",
        nameEn: "General Checkup",
        durationMinutes: 20,
        statedPrice: 100,
        active: true,
      },
    }),
  ]);

  const staffMember = await prisma.staffMember.create({
    data: {
      locationId: location.id,
      displayName: "Dr. Sara Al-Qahtani",
      active: true,
    },
  });

  // Sunday-Thursday, 09:00-17:00 (Saudi work week).
  await prisma.availabilityRule.createMany({
    data: [0, 1, 2, 3, 4].map((weekday) => ({
      staffMemberId: staffMember.id,
      weekday,
      startTime: "09:00",
      endTime: "17:00",
      effectiveFrom: new Date("2026-01-01"),
    })),
  });

  const contact = await prisma.contact.create({
    data: {
      tenantId: tenant.id,
      phoneE164: "+966501234567",
      displayName: "Fatimah Al-Otaibi",
      preferredLanguage: "ar",
    },
  });

  const appointmentStart = new Date("2026-10-05T09:00:00+03:00");
  await prisma.appointment.create({
    data: {
      locationId: location.id,
      staffMemberId: staffMember.id,
      serviceId: checkup.id,
      contactId: contact.id,
      startAt: appointmentStart,
      endAt: new Date(appointmentStart.getTime() + checkup.durationMinutes * 60_000),
      status: "confirmed",
      source: "dashboard",
    },
  });

  // KnowledgeItem.embedding is an Unsupported("vector(1536)") column, which
  // Prisma Client cannot read or write through its normal query API — raw
  // SQL is required for this one column (Module 8's apps/api/src/knowledge
  // service does the same for every create/update). A real embedding
  // requires the language model provider chosen after Module 1's
  // feasibility probe clears its gate (see
  // docs/adr/dialect-feasibility-verdict.md); computeHashingEmbedding is
  // the same fixture-quality stand-in Module 8 uses everywhere else, so
  // this seeded row is actually retrievable by a matching query, not just
  // present for the index to have a row.
  const seedQuestion = "What are your opening hours?";
  const seedAnswer = "We are open Sunday to Thursday, 9 AM to 5 PM.";
  const seedEmbedding = toVectorLiteral(computeHashingEmbedding(seedQuestion));
  await prisma.$executeRaw`
    INSERT INTO "KnowledgeItem" (id, "tenantId", "questionText", "answerText", language, embedding, active)
    VALUES (
      ${randomUUID()}::uuid,
      ${tenant.id}::uuid,
      ${seedQuestion},
      ${seedAnswer},
      ${"en"}::"KnowledgeLanguage",
      ${seedEmbedding}::vector(1536),
      true
    )
  `;

  await prisma.subscription.create({
    data: {
      tenantId: tenant.id,
      planCode: "growth",
      includedMinutes: 2000,
      periodStart: new Date("2026-09-01"),
      periodEnd: new Date("2026-09-30"),
      status: "active",
    },
  });

  console.log(`Seeded tenant ${tenant.id} (${tenant.legalName}).`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });

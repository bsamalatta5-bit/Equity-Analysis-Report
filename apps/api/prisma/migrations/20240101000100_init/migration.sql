-- The vector extension must exist before KnowledgeItem's `embedding
-- vector(1536)` column can be created below. Section 5.1(b) delivers the
-- pgvector extension and similarity index as their own hand-authored
-- migration (20240101000300_knowledge_vector_index); this idempotent
-- statement is duplicated here only so the baseline table definition is
-- itself applicable on an empty database.
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('pending', 'confirmed', 'cancelled', 'completed', 'no_show');

-- CreateEnum
CREATE TYPE "AppointmentSource" AS ENUM ('voice_call', 'dashboard', 'import');

-- CreateEnum
CREATE TYPE "CallDisposition" AS ENUM ('contained', 'escalated', 'abandoned', 'message_captured', 'emergency_transfer', 'provider_failure');

-- CreateEnum
CREATE TYPE "CallDirection" AS ENUM ('inbound');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('tenant_owner', 'location_manager', 'front_desk_user', 'platform_operator');

-- CreateEnum
CREATE TYPE "CallTurnSpeaker" AS ENUM ('caller', 'assistant');

-- CreateEnum
CREATE TYPE "KnowledgeLanguage" AS ENUM ('ar', 'en');

-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('active', 'suspended', 'offboarded');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('active', 'disabled', 'pending_totp_enrollment');

-- CreateEnum
CREATE TYPE "PhoneNumberStatus" AS ENUM ('provisioning', 'active', 'released');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('active', 'past_due', 'cancelled');

-- CreateEnum
CREATE TYPE "EscalationTriggerType" AS ENUM ('explicit_request', 'low_confidence', 'emergency', 'provider_failure', 'silence_timeout');

-- CreateEnum
CREATE TYPE "ActorPrincipalType" AS ENUM ('human_user', 'voice_gateway', 'retention_job', 'telephony_partner');

-- CreateTable
CREATE TABLE "Tenant" (
    "id" UUID NOT NULL,
    "legalName" TEXT NOT NULL,
    "commercialRegistration" TEXT NOT NULL,
    "status" "TenantStatus" NOT NULL DEFAULT 'active',
    "planCode" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Location" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "addressLine" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhoneNumber" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "e164Number" TEXT NOT NULL,
    "providerReference" TEXT NOT NULL,
    "status" "PhoneNumberStatus" NOT NULL DEFAULT 'provisioning',

    CONSTRAINT "PhoneNumber_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'pending_totp_enrollment',
    "totpSecret" TEXT,
    "totpEnrolledAt" TIMESTAMPTZ,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMPTZ,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserLocation" (
    "userId" UUID NOT NULL,
    "locationId" UUID NOT NULL,

    CONSTRAINT "UserLocation_pkey" PRIMARY KEY ("userId","locationId")
);

-- CreateTable
CREATE TABLE "RefreshTokenFamily" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "revokedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshTokenFamily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" UUID NOT NULL,
    "familyId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "issuedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ NOT NULL,
    "consumedAt" TIMESTAMPTZ,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffMember" (
    "id" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "displayName" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "StaffMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Service" (
    "id" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "statedPrice" DECIMAL(10,2) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvailabilityRule" (
    "id" UUID NOT NULL,
    "staffMemberId" UUID NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,

    CONSTRAINT "AvailabilityRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlockedPeriod" (
    "id" UUID NOT NULL,
    "staffMemberId" UUID NOT NULL,
    "startAt" TIMESTAMPTZ NOT NULL,
    "endAt" TIMESTAMPTZ NOT NULL,
    "reason" TEXT NOT NULL,

    CONSTRAINT "BlockedPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "phoneE164" TEXT NOT NULL,
    "displayName" TEXT,
    "preferredLanguage" "KnowledgeLanguage",

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "staffMemberId" UUID NOT NULL,
    "serviceId" UUID NOT NULL,
    "contactId" UUID NOT NULL,
    "startAt" TIMESTAMPTZ NOT NULL,
    "endAt" TIMESTAMPTZ NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'pending',
    "source" "AppointmentSource" NOT NULL,
    "callId" UUID,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Call" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "contactId" UUID,
    "direction" "CallDirection" NOT NULL DEFAULT 'inbound',
    "startedAt" TIMESTAMPTZ NOT NULL,
    "endedAt" TIMESTAMPTZ,
    "disposition" "CallDisposition",
    "containmentFlag" BOOLEAN NOT NULL DEFAULT false,
    "recordingObjectKey" TEXT,
    "recordingExpiresAt" TIMESTAMPTZ,

    CONSTRAINT "Call_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CallTurn" (
    "id" UUID NOT NULL,
    "callId" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "speaker" "CallTurnSpeaker" NOT NULL,
    "transcriptText" TEXT NOT NULL,
    "detectedLanguage" "KnowledgeLanguage",
    "languageConfidence" DOUBLE PRECISION,
    "intent" TEXT,
    "confidence" DOUBLE PRECISION,
    "latencyMs" INTEGER,

    CONSTRAINT "CallTurn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeItem" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "questionText" TEXT NOT NULL,
    "answerText" TEXT NOT NULL,
    "language" "KnowledgeLanguage" NOT NULL,
    "embedding" vector(1536) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "KnowledgeItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EscalationRule" (
    "id" UUID NOT NULL,
    "locationId" UUID NOT NULL,
    "triggerType" "EscalationTriggerType" NOT NULL,
    "targetPhoneE164" TEXT NOT NULL,
    "activeHours" JSONB NOT NULL,

    CONSTRAINT "EscalationRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentRecord" (
    "id" UUID NOT NULL,
    "callId" UUID NOT NULL,
    "announcementPlayedAt" TIMESTAMPTZ,
    "recordingConsented" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ConsentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "actorUserId" UUID,
    "actorPrincipalType" "ActorPrincipalType" NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "occurredAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "planCode" TEXT NOT NULL,
    "includedMinutes" INTEGER NOT NULL,
    "periodStart" TIMESTAMPTZ NOT NULL,
    "periodEnd" TIMESTAMPTZ NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'active',

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageRecord" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "periodStart" TIMESTAMPTZ NOT NULL,
    "billableMinutes" INTEGER NOT NULL DEFAULT 0,
    "overageMinutes" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "UsageRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Location_tenantId_idx" ON "Location"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "PhoneNumber_e164Number_key" ON "PhoneNumber"("e164Number");

-- CreateIndex
CREATE INDEX "PhoneNumber_tenantId_idx" ON "PhoneNumber"("tenantId");

-- CreateIndex
CREATE INDEX "PhoneNumber_locationId_idx" ON "PhoneNumber"("locationId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_tenantId_idx" ON "User"("tenantId");

-- CreateIndex
CREATE INDEX "UserLocation_locationId_idx" ON "UserLocation"("locationId");

-- CreateIndex
CREATE INDEX "RefreshTokenFamily_userId_idx" ON "RefreshTokenFamily"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_familyId_idx" ON "RefreshToken"("familyId");

-- CreateIndex
CREATE INDEX "StaffMember_locationId_idx" ON "StaffMember"("locationId");

-- CreateIndex
CREATE INDEX "Service_locationId_idx" ON "Service"("locationId");

-- CreateIndex
CREATE INDEX "AvailabilityRule_staffMemberId_idx" ON "AvailabilityRule"("staffMemberId");

-- CreateIndex
CREATE INDEX "BlockedPeriod_staffMemberId_idx" ON "BlockedPeriod"("staffMemberId");

-- CreateIndex
CREATE INDEX "Contact_tenantId_idx" ON "Contact"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_tenantId_phoneE164_key" ON "Contact"("tenantId", "phoneE164");

-- CreateIndex
CREATE INDEX "Appointment_locationId_startAt_idx" ON "Appointment"("locationId", "startAt");

-- CreateIndex
CREATE INDEX "Appointment_staffMemberId_idx" ON "Appointment"("staffMemberId");

-- CreateIndex
CREATE INDEX "Appointment_contactId_idx" ON "Appointment"("contactId");

-- CreateIndex
CREATE INDEX "Call_tenantId_startedAt_idx" ON "Call"("tenantId", "startedAt" DESC);

-- CreateIndex
CREATE INDEX "Call_locationId_idx" ON "Call"("locationId");

-- CreateIndex
CREATE INDEX "CallTurn_callId_idx" ON "CallTurn"("callId");

-- CreateIndex
CREATE UNIQUE INDEX "CallTurn_callId_sequence_key" ON "CallTurn"("callId", "sequence");

-- CreateIndex
CREATE INDEX "KnowledgeItem_tenantId_idx" ON "KnowledgeItem"("tenantId");

-- CreateIndex
CREATE INDEX "EscalationRule_locationId_idx" ON "EscalationRule"("locationId");

-- CreateIndex
CREATE UNIQUE INDEX "ConsentRecord_callId_key" ON "ConsentRecord"("callId");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_occurredAt_idx" ON "AuditLog"("tenantId", "occurredAt" DESC);

-- CreateIndex
CREATE INDEX "Subscription_tenantId_idx" ON "Subscription"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "UsageRecord_tenantId_periodStart_key" ON "UsageRecord"("tenantId", "periodStart");

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhoneNumber" ADD CONSTRAINT "PhoneNumber_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhoneNumber" ADD CONSTRAINT "PhoneNumber_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserLocation" ADD CONSTRAINT "UserLocation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshTokenFamily" ADD CONSTRAINT "RefreshTokenFamily_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "RefreshTokenFamily"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffMember" ADD CONSTRAINT "StaffMember_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvailabilityRule" ADD CONSTRAINT "AvailabilityRule_staffMemberId_fkey" FOREIGN KEY ("staffMemberId") REFERENCES "StaffMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlockedPeriod" ADD CONSTRAINT "BlockedPeriod_staffMemberId_fkey" FOREIGN KEY ("staffMemberId") REFERENCES "StaffMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_staffMemberId_fkey" FOREIGN KEY ("staffMemberId") REFERENCES "StaffMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_callId_fkey" FOREIGN KEY ("callId") REFERENCES "Call"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Call" ADD CONSTRAINT "Call_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Call" ADD CONSTRAINT "Call_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Call" ADD CONSTRAINT "Call_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallTurn" ADD CONSTRAINT "CallTurn_callId_fkey" FOREIGN KEY ("callId") REFERENCES "Call"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeItem" ADD CONSTRAINT "KnowledgeItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EscalationRule" ADD CONSTRAINT "EscalationRule_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_callId_fkey" FOREIGN KEY ("callId") REFERENCES "Call"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageRecord" ADD CONSTRAINT "UsageRecord_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

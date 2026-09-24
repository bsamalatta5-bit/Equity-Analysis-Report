# Data model (Section 5)

Canonical attribute list for every entity in Section 5 of the build
specification, exactly as named there. `apps/api/prisma/schema.prisma` is
the actual source of truth for types/constraints; this document exists so
A2.5's schema-parity test
(`tests/integration/schema-parity.spec.ts`) has something
independent of the Prisma schema itself to check the generated Prisma
Client against — the two should never silently drift apart.

Each fenced block lists `ModelName(attr1, attr2, ...)` on its own line,
matching Section 5 verbatim. Fields added beyond Section 5's literal list
(e.g. `UserLocation`, `RefreshTokenFamily`, `RefreshToken` — needed to
implement the A3.7 authorization matrix's "(scoped)" cells and A3.3's
refresh rotation, neither of which Section 5 models explicitly) are not
included here; the parity test only checks that Section 5's own attributes
exist, not that the Prisma schema contains nothing else.

```
Tenant(id, legalName, commercialRegistration, status, planCode, createdAt)
Location(id, tenantId, name, addressLine, timezone, active)
PhoneNumber(id, tenantId, locationId, e164Number, providerReference, status)
User(id, tenantId, email, passwordHash, role, status, totpSecret, totpEnrolledAt, failedAttempts, lockedUntil)
StaffMember(id, locationId, displayName, active)
Service(id, locationId, nameAr, nameEn, durationMinutes, statedPrice, active)
AvailabilityRule(id, staffMemberId, weekday, startTime, endTime, effectiveFrom, effectiveTo)
BlockedPeriod(id, staffMemberId, startAt, endAt, reason)
Contact(id, tenantId, phoneE164, displayName, preferredLanguage)
Appointment(id, locationId, staffMemberId, serviceId, contactId, startAt, endAt, status, source, callId)
Call(id, tenantId, locationId, contactId, direction, startedAt, endedAt, disposition, containmentFlag, recordingObjectKey, recordingExpiresAt)
CallTurn(id, callId, sequence, speaker, transcriptText, detectedLanguage, languageConfidence, intent, confidence, latencyMs)
KnowledgeItem(id, tenantId, questionText, answerText, language, embedding, active)
EscalationRule(id, locationId, triggerType, targetPhoneE164, activeHours)
ConsentRecord(id, callId, announcementPlayedAt, recordingConsented)
AuditLog(id, tenantId, actorUserId, actorPrincipalType, action, entityType, entityId, occurredAt, ipAddress)
Subscription(id, tenantId, planCode, includedMinutes, periodStart, periodEnd, status)
UsageRecord(id, tenantId, periodStart, billableMinutes, overageMinutes)
```

Note: `Tenant` has no `tenantId` field, since it is the tenant root itself,
identified by its own `id` — this matches Section 5 exactly and is
different from every other entity above, which carries `tenantId` either
directly or (for `StaffMember`, `Service`, `AvailabilityRule`,
`BlockedPeriod`, `Appointment`, `EscalationRule`, `CallTurn`,
`ConsentRecord`) via a parent relationship, per Section 5.1(c)'s row-level
security policies.

Relationship direction, as Section 5 states explicitly: `PhoneNumber`
carries `locationId`; `Location` carries no `phoneNumberId`.

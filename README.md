# Voice Receptionist Platform

A multi-tenant platform that answers inbound calls for appointment-based
service businesses in Saudi Arabia (dental/medical clinics in Riyadh,
launch segment). See the build specification this repository implements
for full product context.

## Build status

This build was carried out incrementally by an autonomous coding session.

| Module                                 | Status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 — Dialect feasibility probe          | Harness built and tested; **verdict NOT_EVALUATED** (halt gate unresolved — see `docs/adr/dialect-feasibility-verdict.md`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 2 — Platform foundation                | Built (workspace, Prisma schema, migrations, RLS, guards/filters/pipes)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 3 — Authentication and authorization   | Built (argon2id, sessions, refresh rotation, TOTP, CSRF, rate limiting, the A3.7 role matrix)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 4 — Scheduling domain                  | Built (availability rules, timezone-aware open-slot query, concurrency-safe booking, audit trail)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 5 — Voice gateway core                 | Partially built: webhook verification (A5.1), Call/ConsentRecord creation (A5.3), Redis session persistence (A5.5). Real audio streaming (A5.2/A5.6/A5.7) blocked by Module 1                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 6 — Provider abstraction               | Built: all four interfaces + fixture adapters, env-based selection, timeouts/typed failures (A6.1-A6.3). No real provider is wired — see Module 1                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 7 — Dialogue and booking state machine | Built: the full 10-state FSM (A7.1), confidence-based clarification with escalation after 2 consecutive low-confidence turns (A7.2), slot-contention recovery during confirmation via the real `appointment_no_overlap` exclusion constraint (A7.3), consecutive-silence handling (A7.4), against fixture NLU (`slotName:value` token convention, documented as test-only) and a real Postgres database under RLS. Not wired to real audio — see Module 1                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 8 — Knowledge retrieval                | Built: tenant-scoped `KnowledgeItem` CRUD with embedding writes (`apps/api/src/knowledge`), a pgvector nearest-neighbor retrieval client with the A8.2 similarity threshold gate (`apps/voice-gateway/src/knowledge`), and the `ask_question` dialogue path wired into Module 7's FSM. Real semantic embeddings are blocked by Module 1 like every other language-model capability; a deterministic bag-of-words hashing embedder stands in — see `docs/adr/dialect-feasibility-verdict.md`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 9 — Safety and escalation              | Built: a deterministic bilingual safety classifier evaluated on every caller turn from every dialogue state (A9.1, A9.3), a structural clinical-content output guard (A9.4), and provider-failure escalation with `EscalationRule` active-hours routing (A9.5, including `apps/api/src/escalation` CRUD). **A9.2's recall/false-positive verdict is NOT_EVALUATED** — real labeled corpora don't exist here; see `docs/adr/safety-classifier-verdict.md`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 10 — Recording, consent, and retention | Built: `DialogueStateMachine.start()` marks `ConsentRecord.announcementPlayedAt` and speaks an explicit recording-consent announcement; `CallTurn` transcript persistence refuses to write caller speech until that flag is set (A10.1). Recordings are AES-256-GCM encrypted at rest and reachable only through an HMAC-signed, 300-second URL issued by an RBAC-gated route (A10.2; `apps/api/src/calls`). A standalone retention job deletes expired recordings (90 days) and transcripts (24 months) with a per-tenant audit entry (A10.3; `apps/api/src/retention`). The redaction-layer log assertion and a new static scan proving no other file constructs a `pino` instance both pass (A10.4). Object storage is local disk, not a real bucket — no vendor is pinned in Section 3; see `docs/adr/version-substitutions.md`                                                                                                                                                                                                                                                                                                             |
| 11 — Usage and spend controls          | Built: `UsageRecord` billable-minute accumulation per tenant per UTC billing period, rounded up with a 1-minute minimum, wired into the call-end webhook handler (A11.1; `apps/voice-gateway/src/usage`). A per-tenant concurrent-call ceiling backed by a Redis active-call set rejects calls above `Subscription.concurrentCallLimit` with a bilingual busy message before any `Call` row is created (A11.2; `apps/voice-gateway/src/usage/concurrency-guard.ts`). A monthly spend circuit breaker compares accumulated usage against `Subscription.monthlySpendCapCents` and, on breach, suspends the call via the same transfer-or-message-capture degradation path as A9.5, recording a `spend_limit_suspended` disposition and a single `usage.spend_cap_breached` audit alert per billing period (A11.3; `apps/voice-gateway/src/degradation/spend-circuit-breaker.ts`). A read-only `GET /tenants/:tenantId/usage` endpoint is RBAC-gated to `tenant_owner`/`platform_operator` (`apps/api/src/usage`). No real payment/billing provider is wired — amounts are internal cents, not charged to anyone; no vendor is pinned in Section 3 |
| 12 — Tenant dashboard                  | Built: `apps/dashboard`, a Next.js 15 bilingual (ar/en, RTL/LTR) dashboard against real `apps/api` endpoints — sign-in/TOTP/onboarding, operations overview, calendar and appointment booking, call log and transcript/recording playback, knowledge base, service catalog, staff and availability, escalation rules, locations, tenant user management, usage and billing, and account settings screens, each with real loading/empty/error/offline states (A12.2) and verified end to end with real Postgres/Redis and `@axe-core/playwright` WCAG 2.2 AA scans (see `apps/dashboard/README.md` and `tests/e2e/README.md`). Every screen scanned in both languages with zero `@axe-core/playwright` WCAG 2.2 AA violations (A12.3), every route under its 200KB gzipped budget (A12.5), real `web-vitals`-measured LCP/CLS/INP within the standard "good" thresholds (A12.6), and a written, honestly-scoped manual checklist (A12.8) — see `docs/accessibility/verification.md` too                                                                                                                                                          |
| 13 — Delivery infrastructure           | Built: security response headers with a real per-request CSP nonce on `apps/dashboard` and a maximally restrictive CSP on `apps/api` (A13.7), a 25-payload stored-XSS output-encoding proof and a `dangerouslySetInnerHTML` static scan (A13.8-A13.9), CI gates for lint/typecheck/unit/integration/isolation/build/e2e/bundle-size/`npm audit`/Semgrep/Trivy with a real RLS-testing bug found and fixed along the way (A13.2), a secrets-from-managed-store abstraction (A13.3; `docs/secrets.md`), Terraform for every named resource category (A13.1; unapplied — no cloud account exists), canary/rollback/migration-ordering runbooks (A13.4-A13.6), and a real k6 load-testing run against a real `apps/api` build (`tests/load`) — see `docs/adr/delivery-infrastructure.md` for exactly what was and wasn't verifiable in this sandbox                                                                                                                                                                                                                                                                                                 |

Do not select or wire a real speech/telephony provider, and do not build
the parts of Modules 5+ that depend on one, without first resolving
Module 1's halt gate for real (`docs/adr/dialect-feasibility-verdict.md`).

## Repository layout

- `apps/api` — NestJS core API (Modules 2-4, Module 8's knowledge CRUD, Module 9's escalation-rule CRUD, and Module 10's calls/recordings/retention live here)
- `apps/voice-gateway` — real-time call handling (Module 5 core + Module 6 provider adapters + Module 7 dialogue/booking FSM + Module 8 retrieval client + Module 9 safety classifier/output guard/provider-failure degradation + Module 10 consent/transcript persistence)
- `apps/dashboard` — Module 12's bilingual tenant dashboard (see its README)
- `packages/shared` — Zod schemas, domain types, constants, typed errors
- `packages/logger` — the only permitted logger; redacts transcripts/PII/tokens
- `tools/dialect-feasibility-probe` — Module 1's benchmark harness
- `tests/integration`, `tests/isolation` — automated tests against a real Postgres+Redis
- `tests/e2e` — Module 12's real-browser Playwright suite against real production builds of `apps/dashboard` and `apps/api` (see its README)
- `tests/voice/corpora` — Module 9's safety-classifier corpora (synthetic placeholders — see `docs/adr/safety-classifier-verdict.md`)
- `docs/adr` — architecture decisions, including the three documents above
- `infra/terraform` — Module 13's unapplied Terraform (see its README); `infra/scripts` is local dev's Postgres role-creation script
- `tests/load` — Module 13's k6 load-testing scenario, actually run against a real `apps/api` build (see its README)
- `docs/secrets.md`, `docs/runbooks/` — Module 13's secrets inventory and canary/rollback/migration-ordering runbooks

## Setup

```bash
# 1. Toolchain
nvm install 22.11.0 && nvm use 22.11.0
corepack enable
corepack prepare pnpm@9.12.0 --activate

# 2. Dependencies
pnpm install --frozen-lockfile

# 3. Local services
docker compose up -d postgres redis

# 4. Environment
cp .env.example .env
# Populate every variable in .env before continuing.

# 5. Database
pnpm --filter api exec prisma migrate deploy
pnpm --filter api exec prisma db seed

# 6. Verification
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:integration
pnpm test:isolation

# 7. Run
pnpm --filter api dev
pnpm --filter voice-gateway dev

# 8. Retention job (Module 10, A10.3) — invoked on a schedule in
# production (Module 13/infra, not built this session); run manually here.
pnpm --filter api run retention
```

If you don't have Docker available, a native PostgreSQL 16 (with the
`vector` and `btree_gist` extensions) and Redis 7 reachable at the URLs in
`.env.example` work identically — see `docker-compose.yml` and
`infra/scripts/init-db.local.sql` for exactly what needs to exist
(the `voice_app` role, `vector`/`btree_gist` extensions).

## Key design decisions worth knowing before touching `apps/api`

- **Two Postgres roles, always.** `DATABASE_MIGRATOR_URL` (superuser
  locally) runs migrations only. `DATABASE_URL` (`voice_app`,
  non-superuser) is the only connection the running API uses —
  `apps/api/src/common/prisma/prisma.service.ts` enforces this by
  overriding the schema's own datasource URL at runtime. Row-level
  security (Section 5.1c) is meaningless against a superuser connection,
  which is exactly why these must never be the same role.
- **Every tenant-scoped query goes through `PrismaService.withTenant(...)`**
  (or the request-scoped equivalent via `TenantContext`, populated by
  `TenantContextInterceptor`), which opens an interactive transaction and
  issues `SET LOCAL app.current_tenant_id = ...` before running anything.
  A query against the raw client returns zero rows for every RLS-protected
  table (see `app_current_tenant_id()` in the RLS migration).
- **The booking write (`AppointmentsService.book`) relies on the database
  exclusion constraint, not application locking**, for double-booking
  safety under concurrency (A4.3) — see
  `tests/integration/scheduling.spec.ts`.
- **`apps/voice-gateway` connects to Postgres directly** (its own
  `PrismaClient`, same `voice_app` role, same RLS-via-`withTenant`
  pattern as `apps/api`) rather than calling `apps/api` over HTTP — a
  deliberate simplification from A3.8's literal mTLS+service-token
  design, documented in `docs/adr/dialect-feasibility-verdict.md`. The
  tenant for an inbound call is resolved from the _called_ number only,
  via a second `SECURITY DEFINER` function
  (`resolve_tenant_for_phone_number`), mirroring how login resolves a
  tenant from an email before `app.current_tenant_id` is known.
- **Telephony webhook verification is real, not a stub**, even though no
  real telephony vendor is selected: `FixtureTelephonyProvider.
verifyWebhook` implements A5.1/A3.8's HMAC-SHA256 + 300s replay window +
  single-use-nonce scheme in full, because that scheme is the spec's own
  vendor-agnostic contract. Only `openMediaSession`/`transferCall`/
  `endCall` (vendor-specific API calls) are stubbed.

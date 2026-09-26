# Voice Receptionist Platform

A multi-tenant platform that answers inbound calls for appointment-based
service businesses in Saudi Arabia (dental/medical clinics in Riyadh,
launch segment). See the build specification this repository implements
for full product context.

## Build status

This build was carried out incrementally by an autonomous coding session.

| Module                                 | Status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 — Dialect feasibility probe          | Harness built and tested; **verdict NOT_EVALUATED** (halt gate unresolved — see `docs/adr/dialect-feasibility-verdict.md`)                                                                                                                                                                                                                                                                                                                                                                  |
| 2 — Platform foundation                | Built (workspace, Prisma schema, migrations, RLS, guards/filters/pipes)                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 3 — Authentication and authorization   | Built (argon2id, sessions, refresh rotation, TOTP, CSRF, rate limiting, the A3.7 role matrix)                                                                                                                                                                                                                                                                                                                                                                                               |
| 4 — Scheduling domain                  | Built (availability rules, timezone-aware open-slot query, concurrency-safe booking, audit trail)                                                                                                                                                                                                                                                                                                                                                                                           |
| 5 — Voice gateway core                 | Partially built: webhook verification (A5.1), Call/ConsentRecord creation (A5.3), Redis session persistence (A5.5). Real audio streaming (A5.2/A5.6/A5.7) blocked by Module 1                                                                                                                                                                                                                                                                                                               |
| 6 — Provider abstraction               | Built: all four interfaces + fixture adapters, env-based selection, timeouts/typed failures (A6.1-A6.3). No real provider is wired — see Module 1                                                                                                                                                                                                                                                                                                                                           |
| 7 — Dialogue and booking state machine | Built: the full 10-state FSM (A7.1), confidence-based clarification with escalation after 2 consecutive low-confidence turns (A7.2), slot-contention recovery during confirmation via the real `appointment_no_overlap` exclusion constraint (A7.3), consecutive-silence handling (A7.4), against fixture NLU (`slotName:value` token convention, documented as test-only) and a real Postgres database under RLS. Not wired to real audio — see Module 1                                   |
| 8 — Knowledge retrieval                | Built: tenant-scoped `KnowledgeItem` CRUD with embedding writes (`apps/api/src/knowledge`), a pgvector nearest-neighbor retrieval client with the A8.2 similarity threshold gate (`apps/voice-gateway/src/knowledge`), and the `ask_question` dialogue path wired into Module 7's FSM. Real semantic embeddings are blocked by Module 1 like every other language-model capability; a deterministic bag-of-words hashing embedder stands in — see `docs/adr/dialect-feasibility-verdict.md` |
| 9-13                                   | Not built — see `docs/adr/version-substitutions.md` and `docs/adr/dialect-feasibility-verdict.md` for the full list and why                                                                                                                                                                                                                                                                                                                                                                 |

Do not select or wire a real speech/telephony provider, and do not build
the parts of Modules 5+ that depend on one, without first resolving
Module 1's halt gate for real (`docs/adr/dialect-feasibility-verdict.md`).

## Repository layout

- `apps/api` — NestJS core API (Modules 2-4 and Module 8's knowledge CRUD live here)
- `apps/voice-gateway` — real-time call handling (Module 5 core + Module 6 provider adapters + Module 7 dialogue/booking FSM + Module 8 retrieval client)
- `apps/dashboard` — not built yet (see its README)
- `packages/shared` — Zod schemas, domain types, constants, typed errors
- `packages/logger` — the only permitted logger; redacts transcripts/PII/tokens
- `tools/dialect-feasibility-probe` — Module 1's benchmark harness
- `tests/integration`, `tests/isolation` — automated tests against a real Postgres+Redis
- `docs/adr` — architecture decisions, including the two documents above
- `infra`, `tests/e2e`, `tests/load`, `tests/voice` — scaffolding for Module 13/12/9, not populated

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

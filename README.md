# Voice Receptionist Platform

A multi-tenant platform that answers inbound calls for appointment-based
service businesses in Saudi Arabia (dental/medical clinics in Riyadh,
launch segment). See the build specification this repository implements
for full product context.

## Build status

This build was carried out incrementally by an autonomous coding session.
**Modules 1-4 are built and tested; Modules 5-13 are not.**

| Module | Status |
|---|---|
| 1 — Dialect feasibility probe | Harness built and tested; **verdict NOT_EVALUATED** (halt gate unresolved — see `docs/adr/dialect-feasibility-verdict.md`) |
| 2 — Platform foundation | Built (workspace, Prisma schema, migrations, RLS, guards/filters/pipes) |
| 3 — Authentication and authorization | Built (argon2id, sessions, refresh rotation, TOTP, CSRF, rate limiting, the A3.7 role matrix) |
| 4 — Scheduling domain | Built (availability rules, timezone-aware open-slot query, concurrency-safe booking, audit trail) |
| 5-13 | Not built — see `docs/adr/version-substitutions.md` for the full list and why |

Do not select or wire a real speech/telephony provider, and do not build
on top of Modules 5+, without first resolving Module 1's halt gate for
real (`docs/adr/dialect-feasibility-verdict.md`).

## Repository layout

- `apps/api` — NestJS core API (Modules 2-4 live here)
- `apps/voice-gateway`, `apps/dashboard` — not built yet (see their READMEs)
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

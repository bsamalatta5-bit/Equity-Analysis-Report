# Version substitutions

Section 3 of the build specification requires verifying every pinned
version resolves without conflict, recording any substitution here, and
prohibits resolving conflicts with `--force` or `--legacy-peer-deps`. No
such flag was used anywhere in this build. This document lists every place
the running environment differed from Section 3's exact pin, and why.

## Runtime environment

| Component                     | Pinned  | Actually used | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------------- | ------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node.js                       | 22.11.0 | 22.22.2       | The build session's sandbox ships Node 22.22.2 system-wide; no version manager (nvm) with 22.11.0 available to install. Both are Node 22 LTS; no API used here is version-sensitive between them. `.nvmrc` and `package.json#engines` still declare `22.11.0` as the source of truth for real deployments — `nvm install && nvm use` per Section 8 will get the exact pin there.                                                                                                                                                                                                                                                                                                                                                |
| pgvector (Postgres extension) | 0.8.0   | 0.6.0         | The sandbox has no Docker daemon (see below), so `docker-compose.yml`'s `pgvector/pgvector:pg16` image — which should carry a current pgvector — could not be used to verify this session's changes locally. Postgres was installed natively instead, and `postgresql-16-pgvector` (Ubuntu apt) resolved to 0.6.0, the version in that distribution's repository at build time. `docker-compose.yml` itself still points at the `pgvector/pgvector:pg16` image; whatever version that tag resolves to at deploy time should be verified against 0.8.0 when Docker is available (the ivfflat index and vector column syntax used in migrations are stable across both versions, so this is not expected to be a functional gap). |

## Tooling not pinned by Section 3 but required to make the pinned stack work

Section 3 pins application/runtime dependencies but not every dev-tooling
package. Versions below were chosen as current-at-build-time releases
compatible with TypeScript 5.6.3 and the rest of the pinned stack; they are
not substitutions for anything Section 3 named.

| Package                                                     | Version           | Purpose                                                                                                                                                                                                                                                                               |
| ----------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| eslint                                                      | 8.57.1            | Section 7 requires linting; no version pinned. 8.x chosen over 9.x (flat config) for simpler compatibility with `@typescript-eslint` 8.x's legacy-config support.                                                                                                                     |
| @typescript-eslint/parser, @typescript-eslint/eslint-plugin | 8.11.0            | TypeScript-aware lint rules, compatible with TypeScript 5.6.3.                                                                                                                                                                                                                        |
| prettier                                                    | 3.3.3             | Formatting; Section 7 requires consistent style but pins no formatter version.                                                                                                                                                                                                        |
| @swc/core, unplugin-swc                                     | 1.16.2 / 2.0.0    | NestJS's dependency injection relies on `emitDecoratorMetadata`, which Vitest's default esbuild transform does not emit — this is the officially documented NestJS+Vitest testing setup (see `tests/integration/vitest.config.ts`'s comment), not a substitution for anything pinned. |
| @types/\* packages                                          | latest compatible | Type declarations for pinned runtime packages (express, cookie-parser, supertest, node).                                                                                                                                                                                              |

## Pinned dependencies deliberately not yet wired into running code

These are declared exactly at their Section 3 pin but not yet exercised,
because the module that uses them is out of this session's scope (see
`docs/adr/dialect-feasibility-verdict.md` for what is and isn't built,
and why):

- **@testcontainers/postgresql 10.13.2** — not added as a dependency at
  all. This sandbox has no Docker daemon (`dockerd` could not start:
  `ulimit: error setting limit (Operation not permitted)` under the
  sandbox's container restrictions), so ephemeral-container-per-test-run
  was not viable here. `tests/integration` and `tests/isolation` instead
  connect to an already-running Postgres/Redis via `DATABASE_URL`/
  `REDIS_URL`, matching Section 8's documented setup order (`docker
compose up -d postgres redis` before running tests) and `.github/
workflows/ci.yml`'s GitHub Actions service containers. Real CI and local
  developers with a working Docker daemon are unaffected. If genuinely
  ephemeral per-run databases are wanted later, `@testcontainers/
postgresql` can be added without changing the tests' structure — only
  how `DATABASE_URL`/`REDIS_URL` get set.
- **Playwright 1.48.2, @axe-core/playwright 4.10.0** — `apps/dashboard`
  (Module 12) was not built this session.
- **k6 0.54.0** — `tests/load` — load-testing the running system is a
  Module 13 (Delivery Infrastructure) concern; nothing to load-test yet
  beyond what `tests/integration/scheduling.spec.ts`'s in-process
  concurrency test (A4.3) and performance test (A4.2) already cover for
  Module 4 specifically.
- **Semgrep 1.95.0, Trivy 0.56.2** — referenced in `.github/workflows/
ci.yml`'s scope comment as Module 13 additions; not run this session.
- **Terraform 1.9.8** — `infra/terraform/` — no cloud resources exist yet
  to provision (Module 13).
- **Next.js 15.0.3, React 18.3.1, Tailwind CSS 3.4.14, @tanstack/
  react-query 5.59.0, react-hook-form 7.53.1, date-fns-tz 3.2.0
  (frontend)** — `apps/dashboard` (Module 12) was not built this session;
  `date-fns`/`date-fns-tz` are however used in `apps/api` for the
  timezone-aware slot query (Module 4), at the pinned versions.
- **@sentry/node 8.35.0** — declared as a dependency; not yet initialized
  in `main.ts`. Wiring it meaningfully needs a real `SENTRY_DSN`, which is
  a deployment-time secret (Section 13.3) this session has none of.

## Infrastructure with no pinned vendor, stood in for locally (Module 10)

Section 3 pins `RECORDING_BUCKET`-adjacent concerns nowhere — no object-
storage SDK (S3, Azure Blob, GCS) appears anywhere in the pinned stack, and
`.env.example`'s `RECORDING_BUCKET` was always a placeholder name, not a
selected vendor. This is a genuine infrastructure gap Module 13
(Terraform) would close, not a halt gate like Module 1's or Module 9's
A9.2 — there is no external data, human panel, or vendor selection this
session is blocked on; a real object store is purely a deployment target
apps/api/src/calls/recording-storage.ts's file read/write calls would
point at instead of local disk.

- **`apps/api/src/calls/recording-storage.ts`** stores AES-256-GCM
  encrypted recording objects under `RECORDING_STORAGE_DIR` (default
  `./var/recordings`, gitignored) rather than a real object store. A10.2's
  actual requirements — encryption at rest and access only through an
  HMAC-signed, time-limited URL issued after an authorized request — are
  implemented for real with Node's own `crypto` module, no vendor
  dependency; only the byte storage location is a stand-in. Swapping in a
  real S3/Blob/GCS backend later changes only `encryptAndStoreRecording`/
  `retrieveAndDecryptRecording`/`deleteRecording`'s file I/O, not the
  encryption scheme, the signed-URL scheme, or any caller of this module.
- **`apps/api/src/retention/run-retention.ts`** (A10.3) connects via
  `DATABASE_MIGRATOR_URL` (the same superuser-tier connection
  `prisma/seed.ts` uses) rather than a dedicated least-privileged
  `retention_job` Postgres role, because `CallTurn` and `ConsentRecord`'s
  RLS policies deliberately withhold the platform-operator cross-tenant
  bypass every other tenant-scoped table gets (transcript content is more
  sensitive than call metadata — see the A3.7 RBAC matrix's blank
  `platform_operator` cell for Call transcripts), and no such role was
  provisioned in Section 5.1's migrations. `packages/shared/src/types/principal.ts`'s
  `RetentionJobPrincipal` ("workload identity, no ingress path") already
  anticipated this job running outside the API's own guard/interceptor
  stack; a real deployment would provision that dedicated role in
  Terraform (Module 13) rather than reuse the migrator connection.

## What was verified

`pnpm install` (no `--force`/`--legacy-peer-deps`) resolved every declared
dependency across all workspace packages without conflict, confirmed by
running it repeatedly throughout this build as new packages were added.

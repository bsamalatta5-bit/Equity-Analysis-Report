# Runbook: migration ordering (A13.6)

**Read this before every deploy that includes a Prisma migration.** It
exists because `aws_ecs_service.api` (`infra/terraform/compute.tf`) is a
rolling-update service: during any deploy, the old task definition's
containers and the new one's run **at the same time** against the same
database for as long as it takes new tasks to pass their health check
and old ones to drain. A migration that isn't safe for both code
versions to see simultaneously will break the deploy it ships in, not
some future one.

## The one rule

**Migrations deploy before the code that needs them; migrations that
remove something deploy only after no running code uses it anymore.**
Concretely: every migration must be one of:

1. **Purely additive** — a new table, a new nullable column, a new
   index, a new enum value appended (not reordered/removed). Old code
   ignores the new thing; new code can use it. Safe to run before,
   during, or after the matching app deploy.
2. **A column/table removal, or a `NOT NULL` added to an existing
   column** — only safe once every running task is the version that no
   longer needs the old shape. This always means **two deploys**, not
   one: ship the app change that stops using the old column/table first,
   confirm the old task definition revision is fully drained (`aws ecs
describe-services` shows zero tasks on the previous revision), _then_
   ship the migration that removes it.

If a change doesn't obviously fit pattern 1, treat it as pattern 2 and
split it into two deploys. Reversing this (migrate first when the
running code still expects the old shape) is the single most common way
a rolling deploy takes an outage.

## Standard sequence for an additive migration (the common case)

1. `pnpm --filter api exec prisma migrate dev --create-only` locally;
   review the generated SQL by hand — this codebase's migrations are
   hand-authored/reviewed, not blindly trusted (see
   `apps/api/prisma/migrations/`'s existing files for the house style:
   explicit RLS policy statements, explicit index names).
2. CI (`.github/workflows/ci.yml`) runs `prisma migrate deploy` against a
   fresh database as part of every PR — a migration that doesn't apply
   cleanly never reaches `main`.
3. In the real deploy pipeline (not built this session — see
   `infra/terraform/README.md`): run `prisma migrate deploy` against the
   target environment's database _before_ rolling the ECS service to the
   new task definition. The currently-running (old) code must tolerate
   the new schema shape existing — which an additive migration
   guarantees by construction.
4. Deploy the new task definition (`aws_ecs_service.api`'s rolling
   update). Both old and new code now run against the post-migration
   schema; both are fine with it per step 1's constraint.

## Standard sequence for a destructive change (column/table removal, widening a `NOT NULL`)

1. **Deploy 1**: ship the application code that stops reading/writing
   the column or table, _without_ removing it yet. Confirm via `aws ecs
describe-services --cluster <cluster> --services <service>` that
   `runningCount` tasks are all on the new `taskDefinition` revision and
   the old revision's count is zero.
2. **Verify**, not just assume: check the application's own logs/metrics
   for the removed code path for a full deploy cycle (at minimum, long
   enough to be confident no stale task or stuck connection is still
   using it).
3. **Deploy 2**: run the destructive migration, then (if anything in the
   task definition itself needs to change too) deploy again. There is no
   code change in this second deploy that depends on the column already
   being gone — the application was already not using it as of deploy 1.

## Tenant-scoped RLS migrations specifically

Every migration touching a table with a row-level-security policy
(Section 5.1c; see `apps/api/prisma/migrations/20240102000100_row_level_security`
for the pattern) must keep `tests/isolation/cross-tenant.spec.ts` passing
— that suite is what the "Create the least-privileged application
database role" CI step (`.github/workflows/ci.yml`) exists to make
meaningful (see `docs/adr/delivery-infrastructure.md`'s A13.2 entry for
why running RLS tests as the database superuser would never catch a
regression). Never merge an RLS-touching migration where that suite is
red, skipped, or was not re-run against it.

## Rollback

If a migration ships and the deploy needs to roll back (see
`docs/runbooks/rollback.md`), **never run `prisma migrate reset` or hand-write
a reverse migration against production** as the first response. Check
whether the migration was additive (pattern 1) — if so, the old code
already tolerates the new schema, so rolling the ECS service back to the
previous task definition is enough; the schema stays as-is. Only a
destructive migration (pattern 2) that shipped _before_ its paired code
change (a sequencing mistake this runbook exists to prevent) needs an
actual reverse migration, written and reviewed with the same care as any
other migration — never as a rushed one-off during an incident.

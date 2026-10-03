# Secrets (Module 13, A13.3)

Section 13.3 requires secrets to come from a managed secret store at
runtime, never from a file committed to source control. This document is
the full inventory and the rollout plan; `packages/shared/src/secrets/
load-secret.ts`'s `loadSecret()`/`loadBase64Secret()` is the one place in
`apps/api` that inventory is actually enforced in code (grep for
`loadSecret(` to get the current list programmatically, rather than
trusting this document to stay in sync by hand).

## The boundary this build uses

No application process in this repository calls a secret-store SDK
directly, holds a secret-store credential, or needs code changes when the
store is swapped. Every secret arrives the same way in every environment
this build runs in — local dev, CI, and (per the plan below) staging and
production — as an environment variable the process was already started
with:

```
managed secret store  →  deployment platform injects as env vars  →  process reads env var (loadSecret / requireEnv)
```

This is the standard pattern (sometimes called the "twelve-factor"
boundary): the store is the source of truth and the thing Terraform
(A13.1) provisions access to, but the _application_ only ever sees
`process.env`. That keeps the IAM surface small (the deployment platform's
own role needs store-read access; the running container does not need
its own secrets-manager permissions at all) and means `loadSecret()`
never needs a network call, a retry policy, or a cache — it is
deliberately as thin as the function on this page shows.

- **Local dev and CI**: the env vars are plain values in `.env`
  (gitignored, `.env.example` is the template) or in
  `.github/workflows/ci.yml`'s `env:` block. Every value there is a
  placeholder generated for this build, never a real credential (the
  recording encryption key is a real AES-256 key, but one that only ever
  encrypts throwaway local/CI recordings that get deleted when the
  container is torn down).
- **Staging/production** (not built — no real cloud account exists for
  this session to provision against): Terraform would create one managed
  secret per row below in a real store (AWS Secrets Manager, GCP Secret
  Manager, or Azure Key Vault — no vendor is pinned in Section 3, the
  same reasoning `docs/adr/version-substitutions.md` already applies to
  object storage and payment processing), and the deployment platform
  (whichever runs the containers — ECS/Fargate, Cloud Run, or similar)
  would be configured to inject each one as the matching env var at
  container start, reading from that store via the platform's own
  workload identity, not a credential baked into the image or checked
  into any file.

## Inventory

| Env var                                                                                                 | Used by                                                                                                                  | Rotation impact if changed                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `DATABASE_URL`                                                                                          | `apps/api` (least-privileged, RLS-constrained connection)                                                                | New connections only; in-flight queries unaffected.                                                                                                                                              |
| `DATABASE_MIGRATOR_URL`                                                                                 | `prisma migrate deploy` / `prisma db seed` only, never app code                                                          | Never read outside a migration run.                                                                                                                                                              |
| `REDIS_URL`                                                                                             | `apps/api`, `apps/voice-gateway` (sessions, rate limits, concurrency guard)                                              | New connections only.                                                                                                                                                                            |
| `RECORDING_ENCRYPTION_KEY`                                                                              | `apps/api/src/calls/recording-storage.ts` (AES-256-GCM, via `loadBase64Secret`)                                          | **Rotating invalidates every previously encrypted recording** — a real rotation needs a re-encryption pass or a key-version scheme; not built, since no real recordings exist yet to rotate for. |
| `RECORDING_SIGNING_SECRET`                                                                              | same file, HMAC-signs the 300-second recording access URLs (via `loadSecret`)                                            | Invalidates only currently-outstanding signed URLs (≤300s old) — self-healing within minutes.                                                                                                    |
| `TELEPHONY_WEBHOOK_SIGNING_SECRET`                                                                      | `apps/voice-gateway/src/main.ts` (via `requireEnv`), verifies inbound telephony webhook signatures                       | Must be rotated in lockstep with whatever real telephony provider signs with, once one is selected (Module 1/6 gate).                                                                            |
| `VOICE_GATEWAY_SERVICE_TOKEN`                                                                           | `apps/voice-gateway` (service-to-service auth)                                                                           | New connections only.                                                                                                                                                                            |
| `SPEECH_RECOGNITION_API_KEY`, `SPEECH_SYNTHESIS_API_KEY`, `LANGUAGE_MODEL_API_KEY`, `TELEPHONY_API_KEY` | Module 6 provider adapters — currently always the `fixture` provider, so these are read but never actually sent anywhere | Real provider keys only start mattering once Module 1's halt gate clears.                                                                                                                        |
| `SENTRY_DSN`                                                                                            | not yet initialized anywhere (see `docs/adr/version-substitutions.md`)                                                   | N/A until wired.                                                                                                                                                                                 |

`CSRF_SECRET` is declared in `.env.example` but not read by any code
path today — `apps/api/src/common/guards/csrf.guard.ts` uses the
double-submit cookie pattern (compares a header against a non-`httpOnly`
cookie value the browser already echoes back), which needs no
server-held secret at all. Left in `.env.example` as a placeholder in
case a future signed-token CSRF scheme replaces it; not part of the
enforced inventory above since nothing currently loads it.

## `apps/voice-gateway`'s `requireEnv()`

`apps/voice-gateway/src/main.ts` has its own equivalent helper
(`requireEnv(name)`, same "throw if missing" contract) predating this
module's `loadSecret()`. They are functionally identical; consolidating
them onto one shared helper is a reasonable future cleanup, not required
for either to be a genuine, enforced abstraction today — both already
make "a required secret is silently empty" structurally impossible,
which is the property that matters.

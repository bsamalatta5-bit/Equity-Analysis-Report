# Module 13: delivery infrastructure

Tracks what Section 13 requires and what this session actually built,
part by part, in the order it was built. Each `A13.x` acceptance
criterion gets one entry below; entries are added as each part lands, not
written up front.

## A13.7 — security response headers (CSP + nonce)

**Built, both services, with automated header-assertion tests.**

- `apps/api/src/security.ts`'s `applySecurityHeaders()` sets a maximally
  restrictive CSP (`default-src 'none'`, `base-uri 'none'`,
  `frame-ancestors 'none'`, `form-action 'none'`, `object-src 'none'`) —
  this server only ever returns JSON (or a signed-URL redirect for
  recordings), so there is no script/style/image grant to make and no
  nonce is meaningful: a nonce exists to let one specific inline
  script/style through an otherwise restrictive policy, and nothing here
  ever asks for that. Shared between `main.ts`'s real bootstrap and
  `tests/integration/fixtures.ts`'s `bootstrapApp()` (previously
  `helmet()` was called inline in `main.ts` only, so the integration test
  harness had no security headers at all — a real test/production parity
  gap this closes incidentally). Proven by
  `tests/integration/security-headers.spec.ts` against a real response.
- `apps/dashboard/src/middleware.ts` generates a fresh nonce per request
  (`crypto.randomUUID()`, not a fixed value) and sets it in both the
  response's `Content-Security-Policy` header and a forwarded `x-nonce`
  request header, following Next.js's own documented app-router pattern.
  `script-src 'self' 'nonce-<value>'` and `style-src 'self'
'nonce-<value>'` are the only directives that need it; `connect-src`
  additionally allows `NEXT_PUBLIC_API_ORIGIN` (the dashboard's only
  cross-origin fetch target). Because a nonce baked into a statically
  prerendered page could never match a fresh per-request header,
  `src/app/[locale]/layout.tsx` sets `export const dynamic =
"force-dynamic"` (and no longer exports `generateStaticParams`) — every
  dashboard route moved from Next's SSG (`●`) to real per-request
  rendering (`ƒ`), confirmed in the build output. Proven by
  `tests/e2e/security-headers.spec.ts`: the nonce is present with the
  expected directives, and — the test that actually matters — two
  independent requests for the same URL get two _different_ nonces,
  which would be impossible from a cached static response.
  `tests/e2e`'s full 20-test suite (Module 12) continued passing
  unmodified under this CSP, which is the real proof that Next's
  hydration scripts still load correctly under it.

## A13.8 — output encoding against stored XSS

**Built.** `tests/e2e/stored-xss.spec.ts` stores 25 payloads from the
standard stored-XSS cheat sheet (`<script>`, event-handler attributes,
`javascript:` URIs, SVG/iframe vectors, mixed-case and HTML-entity
variants) directly into a `KnowledgeItem.answerText` field, loads the
real Knowledge Base Editor screen in a real browser, and asserts two
things: every payload's exact literal text is present on the rendered
page (nothing was silently stripped — a sanitizer that drops content
instead of escaping it would also "look safe" while hiding a different
bug), and zero `dialog` events fired (the strongest proof nothing
executed — a real `alert()`/`onerror`/`onload` firing would open one).
This is possible only because every user-controlled string the dashboard
renders goes through plain JSX interpolation (`{item.answerText}`),
which React escapes automatically; see A13.9 below for the structural
guarantee that stays true.

## A13.9 — static scan: no `dangerouslySetInnerHTML`

**Built.** `apps/dashboard/src/dangerous-html-static-scan.spec.ts`
recursively scans every `.ts`/`.tsx` file under `apps/dashboard/src` for
the literal string `dangerouslySetInnerHTML` and fails if it finds one
outside this scan file itself. A sanity-check test first confirms the
scan's own regex actually matches a synthetic example (the same pattern
Module 10's `log-redaction-static-scan.spec.ts` uses), so a silently
broken scan can't pass by matching nothing. A13.8's behavioral proof and
this structural one are deliberately both kept: the behavioral test
proves today's code is safe; this one is what stops a future screen from
reintroducing the hole one `dangerouslySetInnerHTML` at a time.

## A13.2 — CI workflow gates

**Built, with one real bug found and fixed along the way.**
`.github/workflows/ci.yml`'s `postgres` service previously set
`POSTGRES_USER: voice_app` directly — meaning the role the application
connects as in CI _was_ the database superuser, which bypasses row-level
security entirely. `tests/isolation/cross-tenant.spec.ts` (the suite that
exists specifically to prove RLS enforcement) would have passed in CI
regardless of whether RLS actually worked, since a superuser connection
ignores RLS policies outright — a green CI run that proved nothing about
the one property that suite exists to check. Fixed by matching local
dev's actual role separation (`docker-compose.yml` /
`infra/scripts/init-db.local.sql`): the service now starts as the real
`postgres` superuser, and a new "Create the least-privileged application
database role" step runs the same `CREATE ROLE voice_app` /
`GRANT CONNECT` SQL against it before migrations run, so `DATABASE_URL`
in CI is genuinely RLS-constrained the same way it is locally and in a
real deployment.

Added beyond the existing lint/typecheck/migrate/unit/integration/
isolation/build steps: `pnpm --filter dashboard run test:bundle-size`
(A12.5), Playwright browser install + `pnpm test:e2e` (the full Module 12
suite, now including A13.7/A13.8/A13.9's specs), `pnpm audit --prod
--audit-level=critical` (see "Security-motivated version bumps" in
`docs/adr/version-substitutions.md` for why this gates on critical, not
high — six high findings exist today against dependencies this session
could not safely bump, and are documented there rather than hidden),
Semgrep (`semgrep scan --config=p/ci --config=p/owasp-top-ten --error`,
pinned to 1.95.0), and Trivy (a filesystem vulnerability scan at
`HIGH,CRITICAL` plus a separate secret scan, pinned to 0.56.2).

**What was and wasn't verified in this sandbox**: the role-creation SQL,
the `pnpm audit` gate, and the dashboard bundle-size check all ran for
real here and are confirmed working as written. Semgrep's engine was
confirmed working end-to-end against a local throwaway rule (this
sandbox's network policy blocks `semgrep.dev`, which `--config=p/ci` and
`--config=p/owasp-top-ten` need to fetch their rule packs — a real CI
runner has normal internet access and would reach it). Trivy's secret
scanner ran for real and found nothing; its vulnerability-DB download
(`ghcr.io`) is blocked the same way here, confirmed by the exact command
in the workflow failing on that specific network call, not a syntax or
configuration error — again, a real CI runner would reach `ghcr.io`
without issue.

## A13.3 — secrets-from-managed-store abstraction

**Built** (the abstraction and one real call site through it; the actual
managed store is unbuilt, same as A13.1 — no real cloud account exists
for this session to provision one against). `packages/shared/src/
secrets/load-secret.ts`'s `loadSecret()`/`loadBase64Secret()` is the one
enforced read boundary: every secret arrives as an env var the process
was already started with, regardless of whether that env var was set by
a local `.env`, a CI workflow's `env:` block, or — in a real deployment —
a managed store (AWS Secrets Manager / GCP Secret Manager / Azure Key
Vault; no vendor pinned, same reasoning as object storage in
`docs/adr/version-substitutions.md`) that the deployment platform reads
from via its own workload identity and injects at container start. The
application process itself never holds a store credential or calls a
secrets-manager SDK. `apps/api/src/calls/recording-storage.ts`
(previously its own ad hoc read-and-validate logic) now reads through
this helper, re-verified by the full integration suite including the
real encrypt/decrypt round-trip in `tests/integration/calls.spec.ts`.
Full inventory, rotation-impact notes per secret, and the staging/
production rollout plan are in `docs/secrets.md`.

## Not yet built (tracked in this same document as each part lands)

- A13.1 — Terraform for network/database/cache/storage/compute/secrets/
  alerting resources.
- A13.4-A13.6 — canary, rollback, and migration-ordering runbooks.
- Load testing (`tests/load`, k6).

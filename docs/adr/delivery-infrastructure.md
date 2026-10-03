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

## Not yet built (tracked in this same document as each part lands)

- A13.1 — Terraform for network/database/cache/storage/compute/secrets/
  alerting resources.
- A13.2 — CI workflow gates beyond the Module 1-4 scope already in
  `.github/workflows/ci.yml` (dashboard build/e2e, bundle-size check, npm
  audit, Semgrep, Trivy).
- A13.3 — secrets-from-managed-store abstraction.
- A13.4-A13.6 — canary, rollback, and migration-ordering runbooks.
- Load testing (`tests/load`, k6).

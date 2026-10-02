# apps/dashboard

Next.js 15 (App Router) tenant dashboard (Module 12). Being built
incrementally — see the repository root README's module status table for
what's done so far and `docs/adr/` for every documented gap.

## What this part of the build added

- `src/app/[locale]/` — the localized route tree (`en`/`ar`), with
  `src/middleware.ts` redirecting `/` to a detected locale.
- `src/lib/i18n/` — message catalogs typed against one shared `Messages`
  interface (`en.ts` and `ar.ts` both `satisfies Messages`, so a key
  present in one and missing from the other is a compile error) and a
  `dirFor()` helper that sets `dir="rtl"`/`dir="ltr"` on `<html>`.
- `src/styles/tokens.css` — color/type/spacing design tokens, self-hosted
  IBM Plex Sans / Sans Arabic / Mono via `@fontsource/*` (actual WOFF2
  files shipped inside those npm packages, not fetched from a font CDN).
- `src/components/ui/` — design-system primitives (Button, TextField,
  Card, Badge, VisuallyHidden).
- `src/components/states/` — `AsyncStateView`, the single place a screen's
  loading/empty/error/offline state (A12.2) is decided; every screen is
  built by calling this with real query state, not by hand-rolling its own
  four branches.
- `src/lib/api/client.ts` — a typed fetch client against `apps/api`,
  carrying the CSRF double-submit header and distinguishing a thrown
  `ApiError` (a real error response) from a `NetworkError` (the request
  never reached the server — this and `navigator.onLine` are what drives
  `AsyncStateView`'s offline state).
- A custom ESLint rule, `eslint-plugin-dashboard-rtl` (`tools/`), bans
  physical left/right Tailwind classes in favor of logical start/end ones
  (A12.1), enforced on every file this app lints.

`apps/api/src/auth/auth.controller.ts` gained one new endpoint,
`GET /auth/session`, returning the calling principal's own
`{userId, tenantId, role, assignedLocationIds}`. Every other API route is
scoped under `/tenants/:tenantId/...`, which the dashboard cannot address
immediately after a successful sign-in without first learning its own
`tenantId` from somewhere — this is that somewhere, and it exposes no
field `SessionGuard` didn't already resolve.

## Not yet built

Screens (Session Sign-In, Second Factor Verification, Operations Overview,
Appointment Calendar, Call Log, Knowledge Base Editor, etc.), the
accessibility/performance verification pass (A12.3, A12.5, A12.6, A12.8),
and `tests/e2e` journeys — tracked as the remaining Module 12 build steps.

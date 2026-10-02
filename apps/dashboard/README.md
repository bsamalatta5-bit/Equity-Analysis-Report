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

### Auth and onboarding screens

- **Session Sign-In** (`src/app/[locale]/sign-in`) — email/password against
  `POST /auth/login`, routing to `/verify` when the response is
  `totp_required` or `totp_enrollment_required`, straight home on a bare
  `session` result.
- **Second Factor Verification** (`src/app/[locale]/verify`) — one screen
  covering both the already-enrolled (enter a code) and first-time
  (show the secret, then enter a code) paths, since both are the same
  "prove you hold the authenticator" step with a different lead-in.
- **Tenant Onboarding Wizard** (`src/app/[locale]/onboarding`,
  `tenant_owner`-only, matching `POST /tenants/:id/locations`'s own RBAC) —
  four steps composing the already-built location/service/staff/phone-number
  endpoints (location → service → staff → phone number), not a new
  tenant-signup flow; nothing in Section 5's data model or any built module
  exposes self-serve tenant registration.
- `src/components/auth/AuthGuard.tsx` — every authenticated screen's
  `GET /auth/session` check, loading/error/offline state included, with an
  unauthenticated response redirecting to sign-in instead of rendering as
  an error.
- `src/app/[locale]/HomeShell.tsx` — a minimal authenticated home (role,
  sign-out, a link to onboarding for owners) standing in for Operations
  Overview until that screen is built.

Verified end-to-end in `tests/e2e/auth.spec.ts` against real production
builds of both `apps/dashboard` and `apps/api` and real Postgres/Redis: a
real TOTP code computed with `otplib` against both an already-enrolled and
a freshly-enrolled secret, the full onboarding wizard creating real rows
through real endpoints, an invalid-password error, the Arabic route's
`dir="rtl"`, and an `@axe-core/playwright` scan of the sign-in screen
(zero violations — including a real WCAG 2.4.2 "document has no `<title>`"
finding this run caught and fixed via `generateMetadata` in the locale
layout and each auth page).

## Not yet built

The remaining screens (Operations Overview, Appointment Calendar, Call
Log, Knowledge Base Editor, Service Catalog, Staff And Availability,
Escalation Rule Configuration, Location Management, Tenant User
Management, Usage And Billing Summary, Account Settings), and the full
accessibility/performance verification pass across all of them (A12.3,
A12.5, A12.6, A12.8) — tracked as the remaining Module 12 build steps.

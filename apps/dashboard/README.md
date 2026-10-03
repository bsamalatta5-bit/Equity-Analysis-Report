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

Verified end-to-end in `tests/e2e/auth.spec.ts` against real production
builds of both `apps/dashboard` and `apps/api` and real Postgres/Redis: a
real TOTP code computed with `otplib` against both an already-enrolled and
a freshly-enrolled secret, the full onboarding wizard creating real rows
through real endpoints, an invalid-password error, the Arabic route's
`dir="rtl"`, and an `@axe-core/playwright` scan of the sign-in screen
(zero violations — including a real WCAG 2.4.2 "document has no `<title>`"
finding this run caught and fixed via `generateMetadata` in the locale
layout and each auth page).

### Operations, calendar, and appointment screens

Every authenticated screen now lives under the `src/app/[locale]/(app)/`
route group (a URL-transparent grouping folder — `(app)/page.tsx` is still
served at `/{locale}`), whose `layout.tsx` wraps the whole group in one
`AuthGuard` + `AppShell` (sidebar nav, sign-out) instead of each page
re-deriving its own auth check. `useCurrentSession()`
(`src/lib/auth/session-context.tsx`) hands the already-resolved session
down to any page in the group without a second fetch.

- **Operations Overview** (`(app)/page.tsx`) — a location picker (hidden
  when there's only one), today's appointments and recent calls for the
  selected location, and a usage snapshot for `tenant_owner`/
  `platform_operator` (the only roles `GET /tenants/:id/usage` allows).
  Replaces the placeholder "signed in as" card from Module 12 part 1.
- **Appointment Calendar** (`(app)/calendar`) — a 7-day agenda view (one
  `GET /appointments` call per week, grouped client-side by day), not a
  month-grid widget: an agenda list is the more accessible pattern for a
  keyboard/screen-reader user, and every row links to its Appointment
  Detail screen.
- **Appointment Creation Form** (`(app)/appointments/new`) — service →
  staff (optional filter) → date → a real `GET .../open-slots` query,
  rendered as clickable slot buttons; booking sends the slot's own
  `staffMemberId`, never a separately chosen one, since the two could
  otherwise disagree when a row changed between the open-slots query and
  submission.
- **Appointment Detail** (`(app)/appointments/[appointmentId]`) — full
  detail plus the valid next-status actions (`confirmed` → completed /
  no-show / cancelled, matching `AppointmentsService.VALID_TRANSITIONS`;
  terminal statuses show no actions).

**A12.7** (masked phone numbers in list views, unmasked in detail views
reachable by an authorized role): `src/lib/format/phone.ts`'s
`maskPhoneE164` renders only the last 4 digits everywhere a caller's
number appears in a list (Operations Overview, Calendar); the Appointment
Detail screen renders `contact.phoneE164` as-is. Two small, justified
`apps/api` additions made this possible: `AppointmentsService.list` now
joins `contact`/`service`/`staffMember` (previously bare foreign-key IDs
with no display data), and a new `GET /tenants/:id/appointments/:id`
endpoint backs the Detail screen (there was previously no way to fetch one
appointment by id at all).

Verified end-to-end in `tests/e2e/appointments.spec.ts`: a real booking
through the real form (service → open slot → contact phone), the masked
number on the calendar, the unmasked number on the detail page, a status
transition to `completed`, and an `@axe-core/playwright` scan (zero
violations) of both the calendar and the creation form.

### Call Log and Call Detail / Transcript screens

- **Call Log** (`(app)/calls`) — a location-scoped list of calls, each
  row showing the masked caller number (A12.7) and a disposition badge.
- **Call Detail And Transcript** (`(app)/calls/[callId]`) — since the
  transcript endpoint is scoped under a location but a call link only
  carries a `callId`, the screen tries each of the tenant's locations
  until the one RLS actually lets this call through responds. Shows the
  caller's number unmasked (A12.7), every `CallTurn` with its speaker and
  timestamp, and — for `tenant_owner`/`location_manager` only, matching
  the recording-access RBAC row — an accessible recording player.
  `src/components/calls/AudioPlayer.tsx` (A12.8b) is a from-scratch
  player rather than native `<audio controls>`: Chrome exposes a
  playback-rate control only in a context menu, Firefox doesn't expose
  one at all, and A12.8(b) requires keyboard-operable rate control
  explicitly. Every control (play/pause toggle, a seek `<input
type="range">`, a rate `<select>`) is its own focusable element wired
  to a hidden `<audio>`, with an `aria-live` region announcing state
  changes. The transcript (A12.8a) computes each turn's offset from the
  call's `startedAt` and highlights whichever turn the player's current
  playback position falls into.

`CallTurn` had no wall-clock timestamp at all before this screen needed
one — only a `sequence` ordinal — so Module 12 added `occurredAt`
(migration `20240106000100_call_turn_occurred_at`, set by
`apps/voice-gateway/src/pipeline/transcript.ts`'s single insert site) and
`CallsService.listCalls`/`getCallTranscript` now join `contact` the same
way `AppointmentsService.list` already does.

Verified end-to-end in `tests/e2e/calls.spec.ts`: the masked/unmasked
phone split across the Call Log and Call Detail screens, both transcript
turns rendering with their speaker label, a `location_manager` seeing the
"no recording available" state for a call that was never recorded (real
RBAC-gated 404 handling, not a stub), and an `@axe-core/playwright` scan
(zero violations) of both screens — including the custom audio player's
markup.

### Knowledge base, catalog, staff, escalation, and location screens

- **Knowledge Base Editor** (`(app)/knowledge`) — tenant-scoped (no
  location dimension, matching `KnowledgeItem`'s own data model), list
  plus inline add/edit forms; delete is `tenant_owner`-only, matching
  `KnowledgeController`'s own RBAC.
- **Service Catalog** (`(app)/services`) and **Staff And Availability**
  (`(app)/staff`) — location-scoped lists with inline add/edit. Each
  staff member's "Manage availability" expands into its own
  `AvailabilityRule` list and add form — `createAvailabilityRuleRequestSchema`
  requires `staffMemberId` in the request body itself, not only the URL,
  since `AvailabilityController`'s own `ZodValidationPipe` runs before the
  controller merges in the URL param; the dashboard's `createAvailabilityRule`
  sends both.
- **Escalation Rule Configuration** (`(app)/escalation-rules`) —
  location-scoped list plus an add form (one active-hours window per
  rule, matching what the form collects); delete is `tenant_owner`-only.
- **Location Management** (`(app)/locations`) — list/add/edit locations
  (add is `tenant_owner`-only, matching `LocationsController`), with each
  location's phone numbers manageable inline (`tenant_owner`-only, same
  RBAC row as creating a location itself).

Verified end-to-end in `tests/e2e/catalog-management.spec.ts`: a single
`tenant_owner` session adding one of each (a knowledge item, a service, a
staff member with an availability rule, an escalation rule, and a phone
number connected to the seeded location), and an `@axe-core/playwright`
scan (zero violations) of all five screens.

### User management, usage/billing, and account settings screens

- **Tenant User Management** (`(app)/users`, list restricted to
  `tenant_owner`/`platform_operator` matching `TenantsController`'s own
  RBAC; add/edit/disable is `tenant_owner`-only) — list, an add form
  (email, role, assigned locations), and an inline edit form per user.
  There was previously no way to see a user's *current* location
  assignments at all (`listUsers` never selected them, since no caller
  needed them); `updateUser` replaces the full assignment set whenever
  `locationIds` is present in the request, so an edit form that couldn't
  see the current set would silently wipe it on every save that didn't
  touch locations. `apps/api` gained one more read endpoint for this,
  `GET /tenants/:id/users/:userId` (`TenantsService.getUser`), returning
  the same identity fields `listUsers` already exposes plus `locationIds`
  — nothing `assertTenantAccess` didn't already gate.
  Creating a user returns a one-time `temporaryPassword` (there is still
  no invitation channel in this build, per Section 1 and `TenantsService`'s
  own doc comment); the screen shows it once in a dismissible notice and
  never re-fetches it.
- **Usage And Billing Summary** (`(app)/usage`, `tenant_owner`/
  `platform_operator`-only, matching `UsageController`'s RBAC) — the
  current subscription (plan, status, included minutes, spend cap) and a
  history table of `GET /tenants/:id/usage`'s `usageRecords`. A fuller
  version of the snapshot Operations Overview already showed; no new
  `apps/api` surface was needed.
- **Account Settings** (`(app)/settings`) — a change-password form
  (`PATCH /auth/password`, available to every role, matching
  `AuthController`) and, `tenant_owner`-only, a clinic details form
  (legal name, tenant status) against `GET`/`PATCH /tenants/:id`.

Verified end-to-end in `tests/e2e/account-management.spec.ts`: adding,
editing (role plus a location assignment), and disabling a user; the
usage screen showing a seeded subscription and usage record; changing
the signed-in user's own password and confirming a second sign-in with
the *new* password still works later in the same file; updating the
clinic's legal name; and an `@axe-core/playwright` scan (zero violations)
of all three screens.

Running the full e2e suite in one invocation pushes the total number of
real logins comfortably past A3.5's address-level rate limit (10 attempts
per 15 minutes) — correct behavior for the limiter, not a product bug,
since every spec file in this sandbox signs in from the same loopback
address. Each spec file's `beforeAll` now resets that one Redis counter
for itself (`tests/e2e/reset-rate-limit.ts`), so the suite is independent
of run order and of how many other files already ran; it never touches
the per-account counter, so a real brute-force attempt against one
account is still throttled exactly as before.

## Not yet built

The full accessibility/performance verification pass across every
screen (A12.3, A12.5, A12.6, A12.8) — tracked as the remaining Module 12
build step.

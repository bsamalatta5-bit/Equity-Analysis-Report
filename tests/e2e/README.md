# tests/e2e

Playwright journeys against `apps/dashboard` (Module 12), driven through a
real Chromium against real production builds of both `apps/dashboard` and
`apps/api`, with real Postgres and Redis behind them — nothing here is
mocked.

Run from the repository root with the full `.env` sourced into the shell
(services and the full API env the dashboard needs, since neither process
auto-loads `.env` under `pnpm --filter ... exec`):

```
set -a && source .env && set +a
export DASHBOARD_ORIGIN=http://localhost:3000 DASHBOARD_BASE_URL=http://localhost:3000 API_BASE_URL=http://localhost:3001
pnpm --filter dashboard exec playwright test
```

`global-setup.ts` seeds one tenant with three users before the suite
runs — a `front_desk_user` (no TOTP), a `tenant_owner` with no TOTP secret
enrolled yet, and a `tenant_owner` with one already enrolled — covering
every branch of the sign-in flow a spec file can exercise, and writes
their credentials to `.fixture-output.json` (gitignored, regenerated every
run) for spec files to read.

`auth.spec.ts` drives: direct sign-in and sign-out (no 2FA), an invalid
password's inline error, first-time TOTP enrollment through to a completed
onboarding wizard (location → service → staff → phone number, all created
through the real `apps/api` endpoints), already-enrolled TOTP sign-in, the
Arabic route's `dir="rtl"` rendering, and an `@axe-core/playwright` scan of
the sign-in screen (A12.3).

`appointments.spec.ts` seeds its own tenant/location/service/staff member
directly via Prisma (not `global-setup.ts`'s shared fixture — this one
also needs a wide-open `AvailabilityRule` so open slots exist whichever
day the suite happens to run) and drives a real booking through the
Appointment Creation Form, confirms the appointment's phone number is
masked on the Calendar and unmasked on its Detail screen (A12.7), and
transitions it to `completed`. Also scans the Calendar and Creation Form
with `@axe-core/playwright`.

`calls.spec.ts` also seeds its own tenant (a `location_manager`, since
that role can see both the transcript and the recording section) with a
call that has two transcript turns and deliberately no recording, and
confirms: the masked/unmasked phone split across the Call Log and Call
Detail screens, both turns rendering with their speaker label, the
real RBAC-gated "no recording available" state (a 404 from
`GET .../recording`, not a stub), and an `@axe-core/playwright` scan of
both screens — including the custom audio player's markup. Playing back
a real recording isn't exercised here: `apps/api`'s recording storage
resolves its directory relative to its own process's cwd, which differs
from this spec file's, so it's covered instead by the real encrypted
recording already in `tests/integration/calls.spec.ts` (Module 10,
A10.2).

`catalog-management.spec.ts` seeds its own `tenant_owner` (every create
action across these five screens needs owner or location_manager, and
only an owner can also delete a knowledge item, add a location, or add a
phone number, so one owner session covers all of it) and drives one real
create through each of the Knowledge Base Editor, Service Catalog, Staff
And Availability (staff member plus one availability rule), Escalation
Rule Configuration, and Location Management (a phone number added to the
seeded location) screens, then scans all five with
`@axe-core/playwright`. Caught a real bug this run, not a test-only
quirk: `createAvailabilityRuleRequestSchema` requires `staffMemberId` in
the request body itself (the controller only merges in the URL param
after Zod validation already ran), so the dashboard's own client was
sending an incomplete body and getting a 400 on every attempt — fixed in
`src/lib/availability/api.ts`, not worked around in the test.

The remaining screens' (Tenant User Management, Usage And Billing
Summary, Account Settings) accessibility proof is covered by the
Module 12 accessibility/performance verification pass once every screen
exists.

Chromium's `old` headless mode was removed from the version this sandbox
has preinstalled, hence `PLAYWRIGHT_CHROMIUM_USE_HEADLESS_NEW=1` and
`launchOptions.executablePath` pointing at `/opt/pw-browsers/chromium` in
`apps/dashboard/playwright.config.ts` — both needed only because the
pinned `@playwright/test` version (1.48.2) predates that browser revision;
a real deployment target with a matching Playwright-managed browser
install needs neither.

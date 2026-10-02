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
the sign-in screen (A12.3) — the first screen's automated accessibility
proof; the rest are covered by the Module 12 accessibility/performance
verification pass once every screen exists.

Chromium's `old` headless mode was removed from the version this sandbox
has preinstalled, hence `PLAYWRIGHT_CHROMIUM_USE_HEADLESS_NEW=1` and
`launchOptions.executablePath` pointing at `/opt/pw-browsers/chromium` in
`apps/dashboard/playwright.config.ts` — both needed only because the
pinned `@playwright/test` version (1.48.2) predates that browser revision;
a real deployment target with a matching Playwright-managed browser
install needs neither.

# Module 12: accessibility and performance verification (A12.3, A12.5, A12.6, A12.8)

**Status: self-reviewed by the autonomous coding session that built
`apps/dashboard`, not independently verified by a human auditor or a real
assistive-technology user.** Automated tooling (`@axe-core/playwright`,
real Chromium, real `web-vitals` measurements) ran against real production
builds and real data in every case below, and those results are real test
output, not estimates. What this document cannot provide is what no
automated tool can: a human using NVDA/JAWS/VoiceOver, a human relying on
switch access or voice control, or a disabled user's actual experience of
the product. Where this matters, it is called out explicitly rather than
silently folded into a passing checklist item.

## A12.3 — automated WCAG 2.2 AA scan across every screen, both languages

`tests/e2e/accessibility-sweep.spec.ts` scans every one of the 17 routes
below in both `en` and `ar` (34 scans) with `@axe-core/playwright`'s
`wcag2a`/`wcag2aa`/`wcag22aa` rule sets, against a real production build
and real seeded data (a location, service, staff member, appointment, and
call with a transcript) — zero violations in every case, most recently
confirmed in this session's full e2e run. The sign-in and second-factor
screens are scanned separately (`the sign-in and second-factor screens...`
in the same file) since reaching the authenticated routes requires signing
in first, and the second-factor screen requires a live `challengeToken`:

| Screen                 | Route                        |
| ---------------------- | ---------------------------- |
| Session sign-in        | `/sign-in`                   |
| Second-factor verify   | `/verify?challengeToken=...` |
| Operations overview    | `/`                          |
| Onboarding wizard      | `/onboarding`                |
| Appointment calendar   | `/calendar`                  |
| Appointment creation   | `/appointments/new`          |
| Appointment detail     | `/appointments/[id]`         |
| Call log               | `/calls`                     |
| Call detail/transcript | `/calls/[callId]`            |
| Knowledge base editor  | `/knowledge`                 |
| Service catalog        | `/services`                  |
| Staff and availability | `/staff`                     |
| Escalation rules       | `/escalation-rules`          |
| Locations              | `/locations`                 |
| Tenant user management | `/users`                     |
| Usage and billing      | `/usage`                     |
| Account settings       | `/settings`                  |

**What this does not cover**: axe-core's rule set is itself documented
(by Deque, its publisher) as catching roughly 30-50% of WCAG failures by
automated means alone. A clean scan is strong evidence against the
failures it checks (missing labels/roles/names, contrast ratios, ARIA
misuse, missing `lang`, duplicate ids, and similar), not proof of full
WCAG 2.2 AA conformance. Criteria axe-core cannot evaluate at all are
listed under "Known gaps" below.

## A12.5 — bundle size budget (200KB gzipped per route)

`apps/dashboard/scripts/check-bundle-size.mjs` reads the same
`app-build-manifest.json` Next.js's own build output is generated from,
gzips every unique JS chunk a route's leaf page entry references (which
already includes every ancestor layout's chunks), and fails if any
route's total exceeds 200KB. Run via `pnpm --filter dashboard run
test:bundle-size` after `pnpm --filter dashboard run build`. Current
result, largest route first:

```
130.2 kB gzipped  /[locale]/(app)/calendar
129.3 kB gzipped  /[locale]/(app)/appointments/new
124.4 kB gzipped  /[locale]/(app)
123.4 kB gzipped  /[locale]/(app)/calls
...
 98.5 kB gzipped  /_not-found
All 18 routes are within the 200KB gzipped budget (A12.5).
```

Every route is comfortably under budget — the largest (the calendar, with
`date-fns`/`date-fns-tz`) is at 65% of the 200KB ceiling.

## A12.6 — Core Web Vitals (LCP, CLS, INP)

`tests/e2e/web-vitals.spec.ts` injects Google's own `web-vitals` library
(not a hand-rolled approximation) via `page.addInitScript` before any page
script runs, against real production builds, and measures:

- **LCP** (Largest Contentful Paint) on the sign-in screen and, after a
  real sign-in, the operations overview and calendar screens — all three
  passed the standard "good" threshold (≤2500ms) in this session's run.
- **CLS** (Cumulative Layout Shift) on the same three screens — all
  passed the standard "good" threshold (≤0.1).
- **INP** (Interaction to Next Paint), measured after a real, trusted
  click (Chromium's own input pipeline, not a synthetic DOM event) that
  navigates from the operations overview to the calendar — captured at
  24ms in this session's run (threshold: ≤200ms), well within budget.

INP is the one metric headless Chromium does not reliably report on every
run (a documented characteristic of synthetic/headless measurement, not a
product issue) — the test asserts the threshold only when a value is
actually captured, and records whichever value (or its absence) as a test
annotation rather than failing the suite on absence alone. Every run in
this session captured a real value.

These are single-machine, single-run, synthetic-network measurements, not
a real-user-monitoring (RUM) distribution across real devices/networks —
the standard caveat for any lab measurement of web vitals, documented here
rather than presented as field data.

## A12.8 — manual accessibility checklist (self-review)

Reviewed directly against the dashboard's source, not inferred from the
automated scans above:

- [x] **Keyboard operability** — every interactive control in
      `src/components/ui/` (`Button`, `TextField`) and every custom widget
      (`AudioPlayer`'s play/pause/seek/rate controls, `AsyncStateView`'s retry
      button) is a native `<button>`/`<input>`/`<select>`/`<a>`, so native tab
      order and activation (Enter/Space) work without any custom key handling
      to get wrong. No `tabindex` or custom `onKeyDown` focus trap exists
      anywhere in `apps/dashboard/src`.
- [x] **Visible focus indicator** (A12.4) — one global rule
      (`src/styles/globals.css`'s `:focus-visible`) applies a 3px outline at
      the design tokens' focus color to every focusable element, so no
      component can ship without one by omission.
- [x] **Skip-to-content link** — `src/app/[locale]/layout.tsx` renders a
      real `<a href="#main-content">` as the first focusable element on every
      page, visually hidden until focused (`sr-only focus:not-sr-only`); every
      page's `<main>` carries `id="main-content"`.
- [x] **Document language and direction** — `<html lang={locale}
dir={dirFor(locale)}>` is set from the real route segment on every
      request (not a client-side patch), so assistive technology gets the
      correct language immediately, and Arabic renders `dir="rtl"` structurally
      rather than through mirrored CSS alone.
- [x] **No physical-direction CSS** (A12.1) — enforced by a custom ESLint
      rule (`tools/eslint-plugin-dashboard-rtl`), not just reviewed by eye;
      linting the dashboard fails if a physical `left-`/`right-`/`ml-`/`mr-`
      Tailwind class is introduced.
- [x] **Every screen's loading/empty/error/offline state** (A12.2) — the
      single shared `AsyncStateView` component means a screen cannot compile
      its data-fetching path without supplying all four; reviewed by reading
      every screen's use of it, not just by the e2e suite exercising the
      success path.
- [x] **Masked/unmasked phone numbers correctly RBAC-scoped** (A12.7) —
      `maskPhoneE164` is used in every list view; the two detail views that
      show the real number (`AppointmentDetail`, `CallDetail`) are reached only
      through routes the backend's own RBAC already restricts the same way.
- [x] **Accessible name for every form control** — every `TextField` and
      native `<select>` in the dashboard is rendered through a `<label
htmlFor>` pointing at the control's id (see `TextField.tsx`), or (for
      bare `<select>`s like the trigger-type/locale pickers) a `<label>`
      wrapping the control directly. This is also what the axe-core sweep
      above checks mechanically; it is listed here because it was verified by
      reading every form in the codebase, not only inferred from a passing
      scan.
- [x] **Touch/pointer target size** — `Button`'s `min-h-[2.5rem]` (40px)
      and every checkbox/radio's surrounding `<label>` click target exceed
      WCAG 2.2's 24×24px minimum (2.5.8, AA) by a comfortable margin.
- [ ] **Screen reader announcement quality** — `role="alert"` on every
      form error and `aria-live` on the audio player's status region are
      structurally correct (and caught by axe-core if the role/attribute were
      missing), but how NVDA, JAWS, or VoiceOver actually _phrase_ those
      announcements, and whether the phrasing is clear in context, was not
      tested with a real screen reader. This is the single largest gap this
      session's tooling cannot close.
- [ ] **200% zoom / text reflow** (1.4.10) — the layout uses Tailwind's
      responsive utilities and `flex-wrap` throughout, which is favorable, but
      no test in this suite resizes the viewport or sets a 200% zoom level and
      checks for lost content or horizontal scrolling. Not verified.
- [ ] **Real assistive-technology user testing** — nothing in this
      session substitutes for a disabled user actually operating the product.
      This entire document is a self-review by the system that wrote the
      code, which is a materially weaker form of evidence than independent
      human testing, and should be treated as such by anyone deciding whether
      this dashboard is ready to ship.

## How to reproduce every result above

```bash
set -a && source .env && set +a
export DASHBOARD_ORIGIN=http://localhost:3000 DASHBOARD_BASE_URL=http://localhost:3000 API_BASE_URL=http://localhost:3001
export PLAYWRIGHT_CHROMIUM_USE_HEADLESS_NEW=1   # only needed on this sandbox's preinstalled Chromium revision

pnpm --filter dashboard run build
pnpm --filter dashboard run test:bundle-size
pnpm --filter dashboard exec playwright test accessibility-sweep.spec.ts web-vitals.spec.ts
```

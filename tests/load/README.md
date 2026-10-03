# tests/load

k6 load testing against a real running `apps/api` (Module 13). Covers
what Module 4's own tests don't: `tests/integration/scheduling.spec.ts`'s
A4.2/A4.3 are in-process and correctness/single-query-latency-focused
(a real database, but no real HTTP layer, no concurrent connections, no
guard/interceptor stack overhead). This exercises the actual deployed
surface — real HTTP, real auth, real concurrent load.

## Running it

k6 scripts run in k6's own JS engine, not Node, so they can't `import`
Prisma to seed their own test data — `seed.ts` is the Node-side half,
run once with `ts-node` before `k6 run`, writing `.fixture.json`
(gitignored, regenerated every run) that `dashboard-read-load.js` reads
via `open()` at its own init time.

```
set -a && source .env && set +a   # from the repo root

# 1. Seed a tenant/location/front_desk_user/20 calls.
pnpm --filter @voice-receptionist/tests-load run seed

# 2. Start a real production build of apps/api (a separate terminal, or
#    background it) — this is the server k6 actually hits.
cd apps/api && NODE_ENV=production API_PORT=3001 pnpm run build && pnpm run start

# 3. Run the scenario against it.
cd tests/load && API_BASE_URL=http://localhost:3001 k6 run dashboard-read-load.js
```

`seed.ts` creates a `front_desk_user` specifically because that role
needs no TOTP enrollment (Module 3) — k6 has no TOTP library available,
so this is the only role that can reach an authenticated session with a
single `POST /auth/login` in `setup()`. That login happens exactly once
per `k6 run`, not once per virtual user or iteration, both to avoid
needlessly exercising A3.5's per-address rate limiter (10 attempts per 15
minutes — the same limiter `tests/e2e`'s suite works around in
`reset-rate-limit.ts`) and because it's also the realistic pattern: one
browser session, many subsequent reads.

## The scenario

`dashboard-read-load.js` ramps 0 → 20 virtual users over 15s, holds 20 for
30s, ramps back to 0 over 10s, each iteration calling `GET /tenants/:id/
locations/:id/calls` — the Call Log screen's own endpoint
(`apps/dashboard/src/lib/calls/api.ts`'s `listCalls`), chosen as a
representative authenticated list-read: every dashboard screen in
Module 12 follows the same guard/interceptor/RLS-scoped-query shape, so
this scenario's result characterizes that shape generally, not something
peculiar to calls specifically.

Thresholds: `p(95)<500ms` and `http_req_failed` rate `<1%`. 500ms (not
A4.2's 200ms) because this is a full HTTP round trip through the real
guard/interceptor stack, not an in-process query — a looser, more
realistic budget for what's actually being measured here.

## A real result (this session, 20 VUs, 55s, against this exact scenario)

```
checks.........................: 100.00% 53926 out of 53926
http_req_duration..............: avg=30.19ms p(90)=43.82ms p(95)=47.8ms max=82.76ms
http_req_failed.................: 0.00%   0 out of 26964
http_reqs.......................: 26964   489.455045/s
```

Both thresholds passed with wide margin (p95 47.8ms against a 500ms
budget; 0% failures against a 1% budget) — real output from a real run
in this session, not a projection. This is one scenario against one
read-heavy endpoint on one (sandboxed, non-production-sized) machine; it
characterizes this endpoint's shape, not a capacity guarantee for a real
deployment's actual hardware, network, or concurrent-call volume.

## Known gap

Only one scenario exists (an authenticated list-read). Not covered:
write-heavy load (booking an appointment under concurrency — already
covered differently by `tests/integration/scheduling.spec.ts`'s A4.3,
which proves correctness under 50 concurrent bookings for one slot, not
HTTP-layer throughput), and `apps/voice-gateway`'s real-time call-handling
path, which needs a WebSocket-capable load pattern k6 can do
(`k6/ws` or k6's `k6/experimental/websockets` module) that this first
scenario doesn't attempt.

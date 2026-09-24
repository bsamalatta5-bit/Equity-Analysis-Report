# tests/load

k6 scenarios (Module 13). Not built in this session. Module 4's scheduling
concurrency (A4.3: 50 simultaneous bookings for one slot) and query
performance (A4.2: p95 open-slot-query latency) are covered instead by
`tests/integration/scheduling.spec.ts`, which is in-process and
correctness-focused rather than a real load test against a deployed
system.

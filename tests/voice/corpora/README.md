# tests/voice/corpora

A9.6's emergency-and-clinical corpus (200 positive cases, 400 negative
cases) and adversarial clinical-content prompt set (50 cases) belong here,
versioned and reviewed on every safety classifier change.

The `*.synthetic-example.json` files in this directory are small, clearly
marked placeholders (`isSyntheticPlaceholder: true`) used only to exercise
`apps/voice-gateway/src/safety`'s tooling in this repository's own tests —
they are not the real corpora and were never used to compute a real A9.2
verdict. See `docs/adr/safety-classifier-verdict.md` for what would need
to replace them, and
`apps/voice-gateway/src/safety/safety-classifier-evaluation.ts`'s
`determineSafetyVerdict()`, which refuses to return PASS or FAIL for any
manifest flagged this way.

# Module 1: dialect feasibility probe — verdict

**Status: NOT EVALUATED. This is a halt gate (Section 9) and it has not
been cleared.** No speech recognition or synthesis provider has been
selected for production use, and none should be, until this document
records a real PASS.

## What this records

Section 6, Module 1 requires:

- **A1.1** — a 500-utterance corpus of telephony-band (8kHz) recordings,
  human-transcribed, spanning Najdi and Hijazi dialect speakers, mixed
  gender and age.
- **A1.2** — word error rate (WER) measured per candidate speech
  recognition provider against that corpus, reported as a comparison
  table.
- **A1.3** — candidate synthesis voices rated by 20 native listeners on a
  five-point accent authenticity scale.
- **A1.4** — a written verdict on whether any provider meets ≤15% WER. A
  negative verdict halts the build and returns the architecture for
  revision.

## Why this session could not produce a real verdict

This build was carried out by an autonomous coding session with no access
to real telephony-band audio recordings, no ability to recruit or record
Najdi/Hijazi speakers, no ability to run actual speech-recognition or
speech-synthesis provider APIs against real audio, and no way to recruit
20 native Arabic listeners to rate voice authenticity. All four of A1.1
through A1.3 require real-world data collection and human panels that are
outside what this session can do, and A1.4's verdict is only meaningful
once they exist.

## What was actually built (tools/dialect-feasibility-probe)

To avoid the halt gate being either skipped outright or answered with
fabricated numbers, this session built the **benchmark harness** the real
evaluation will run through, fully implemented and tested:

- `src/corpus.ts` — the corpus manifest schema (dialect, gender, age
  bracket, audio path, reference transcript per utterance) and
  `assertMeetsA11SampleSize()`, which enforces A1.1's 500-utterance,
  both-dialect, mixed-gender, mixed-age requirement for any manifest not
  explicitly marked as a placeholder.
- `src/wer.ts` — word error rate via word-level edit distance, unit-tested
  against known substitution/deletion/insertion cases.
- `src/rating.ts` — per-voice listener rating aggregation, enforcing A1.3's
  20-listener minimum.
- `src/report.ts` — builds the A1.2 comparison table and applies A1.4's
  15% threshold to compute a verdict.
- `src/run-benchmark.ts` — a CLI that takes a corpus manifest plus
  provider transcripts/ratings and emits the full report.
- `corpora/manifest.synthetic-example.json` — a 4-utterance fixture, its
  manifest explicitly flagged `isSyntheticPlaceholder: true`, used only to
  exercise the tooling above in this session's own tests. **It is not real
  data and was never used to compute a verdict.**

**`determineVerdict()` refuses to return PASS or FAIL for any corpus
flagged `isSyntheticPlaceholder: true`** — it returns `NOT_EVALUATED` with
an explanatory reason unconditionally, regardless of what the computed WER
numbers happen to be. This is a deliberate code-level guardrail, not just
a policy statement: it is not possible to accidentally produce a passing
verdict from placeholder data by running the existing tooling. See
`tools/dialect-feasibility-probe/src/report.spec.ts` for the test proving
this.

## What must happen before this can change

1. Commission or license a real 500-utterance Najdi/Hijazi telephony-band
   corpus with human reference transcripts (A1.1).
2. Run each candidate ASR provider against it and record WER via
   `run-benchmark.ts` with `isSyntheticPlaceholder: false` (A1.2).
3. Recruit 20 native listeners and collect authenticity ratings for each
   candidate TTS voice (A1.3).
4. Re-run `run-benchmark.ts`; if the best provider is at or below 15% WER,
   replace this document's status with the real **PASS** verdict, name the
   selected provider, and only then wire `SPEECH_RECOGNITION_PROVIDER` /
   `SPEECH_SYNTHESIS_PROVIDER` (`.env.example`) to a real adapter. If every
   provider exceeds 15% WER, record **FAIL** here and escalate per A1.4 —
   Modules 5 onward (the voice pipeline itself) must not proceed past a
   FAIL.

## Consequence for this build's scope

Because this gate is unresolved, `SPEECH_RECOGNITION_PROVIDER`,
`SPEECH_SYNTHESIS_PROVIDER`, `LANGUAGE_MODEL_PROVIDER`, and
`TELEPHONY_PROVIDER` in `.env.example` are all set to `fixture` — a
placeholder value, not a real vendor. `provider-factory.ts`
(`apps/voice-gateway/src/providers/provider-factory.ts`) throws for any
other value, by design: there is no real adapter to select yet, and it
should fail loudly rather than silently falling back to a fixture in an
environment that thinks it configured something real.

**What was subsequently built anyway (Module 6, then Module 5's core):**
the four provider interfaces and their fixture-backed adapters, plus the
parts of the voice gateway that do not depend on a selected provider at
all — telephony webhook verification (A5.1: real HMAC-SHA256 + replay
window + nonce logic, not a stub, since that scheme is the spec's own
vendor-agnostic contract), tenant resolution from the called number
(A3.8), Call/ConsentRecord creation before any assistant utterance (A5.3),
and Redis-backed session state that survives a process restart (A5.5).
None of this required resolving the halt gate, because none of it touches
real audio or a real speech/telephony vendor.

**What remains genuinely blocked:** real-time bidirectional audio
streaming and its latency/language-detection accuracy claims (A5.2, A5.6,
A5.7), the dialogue state machine (Module 7), knowledge retrieval (Module
8), the safety classifier (Module 9), and everything else that needs an
actual speech recognition, synthesis, or language model call to mean
anything. `apps/voice-gateway/src/main.ts`'s WebSocket endpoint accepts
and tracks connections (satisfying "establishes a media session" as
infrastructure) but streams no real audio — there is nothing to stream
until a provider is selected.

**A deliberate architecture simplification worth flagging:** A3.8
specifies the voice gateway authenticates to write appointment/call/turn
data via "mutual TLS plus a service-scoped token," implying it calls
apps/api's HTTP layer rather than touching the database directly. This
build has the voice gateway connect to Postgres directly instead (its own
`PrismaClient`, same `voice_app` role, same RLS enforcement via
`withTenant` — see `apps/voice-gateway/src/common/prisma-client.ts`),
resolving the tenant from the called number through a second
`SECURITY DEFINER` SQL function
(`20240103000100_resolve_tenant_by_phone_number`), mirroring the pattern
already used for login's `resolve_tenant_id_for_email`. This keeps the
same tenant-isolation guarantee (RLS, not application logic, still does
the enforcing) without building a second cross-service authentication
scheme and an `apps/api` calls module in the same session. A fuller
implementation matching A3.8 literally would route these writes through
`apps/api` over mTLS with a service-scoped token instead — worth doing
before this handles real traffic, tracked here rather than silently
diverged from.

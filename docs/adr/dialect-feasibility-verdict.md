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

**What was subsequently built anyway (Module 7):** the dialogue and
booking state machine (`apps/voice-gateway/src/booking/dialogue-state-machine.ts`)
implementing all 10 states from Section 6 (A7.1), confidence-based
clarification that escalates after two consecutive low-confidence turns
(A7.2), slot-contention recovery during confirmation — retried against the
real `appointment_no_overlap` exclusion constraint, not a mock (A7.3), and
consecutive-silence handling (A7.4). This was possible without resolving
the halt gate because the FSM itself is a pure function of
already-recognized text and a `TurnEvent`: it never calls a speech or telephony
provider directly, only the `LanguageModelProvider` interface (intent
classification and slot extraction), which the fixture adapter satisfies
using a documented test-only `slotName:value` token convention (see
`apps/voice-gateway/src/providers/fixture/language-model.fixture.ts`) —
not real NLU. All availability/booking reads and writes still go through
`withTenant`, so RLS enforcement is real even though the language
understanding driving them is not.

**What was subsequently built anyway (Module 8):** tenant-scoped
`KnowledgeItem` CRUD with embedding writes
(`apps/api/src/knowledge/knowledge.service.ts`), and a pgvector
nearest-neighbor retrieval client with the A8.2 similarity threshold gate
(`apps/voice-gateway/src/knowledge/retrieval.ts`), wired into Module 7's
FSM as a new `ask_question` intent branch. Section 6's Module 6 names
exactly four provider interfaces — none of them an embedding provider —
so knowledge retrieval had no fixture convention to reuse. Rather than
invent a fifth env-selected provider abstraction purely to wrap something
this session cannot make real anyway, `packages/shared/src/embedding/hashing-embedder.ts`
adds a small, pure, deterministic function (`computeHashingEmbedding`):
Unicode-aware bag-of-words tokenization, FNV-1a hashing into one of
KnowledgeItem.embedding's 1536 dimensions per token, L2-normalized. Its
cosine similarity is real and testable — matching vocabulary scores
higher than unrelated text, in both Arabic and English — but it is not
semantic (no synonym or paraphrase recognition), so it stands in for a
real embedding model for exactly the same reason the Module 6 fixtures
stand in for real ASR/TTS/NLU: no such provider has been selected, because
Module 1's gate is what selecting one would depend on. Both apps/api's
writes and apps/voice-gateway's reads call this same shared function, so
a KnowledgeItem created through the dashboard-facing API is genuinely
retrievable through the voice pipeline's read path, not just
schema-compatible with it — this is not a lower bar than Modules 6/7's
provider-based fixtures. Embeddings are keyed on `questionText` alone
(not blended with `answerText`): retrieval embeds the caller's spoken
question and compares it against the same space, and A8.2's threshold
gate only holds together when both sides represent the same kind of
text. A8.1's tenant isolation runs on RLS as everywhere else in this
codebase, plus an explicit `"tenantId" = $tenantId` predicate in the raw
SQL query itself (`retrieveTopKnowledgeMatch`), matching the same
defense-in-depth convention `tenants.service.ts` already uses for any
table with a direct tenantId column. A8.3's grounding is structural, not
a heuristic check after the fact: `draftGroundedResponse` is never called
at all when similarity falls below the threshold, so there is no code
path by which an unrelated stored fact (a price, a service name) can
reach the caller.

**What was subsequently built anyway (Module 9):** the safety classifier
itself (`apps/voice-gateway/src/safety/safety-classifier.ts`) is **not**
blocked by this halt gate — it is a deterministic, bilingual rule-based
implementation that runs on already-recognized text, exactly like Modules
7 and 8's logic, and needs no ASR/TTS/LLM vendor to execute. It is wired
into every dialogue turn (A9.1, A9.3), a structural output guard protects
the one path with tenant-authored/model-drafted content (A9.4), and
provider-failure escalation with active-hours routing is fully built and
tested (A9.5). What remains open for Module 9 is narrower and different in
kind from this document's gap: not a missing implementation, but missing
_evidence_ that the classifier's real-world recall and false-positive rate
clear A9.2's numeric bar — recorded separately in
`docs/adr/safety-classifier-verdict.md`, since it is its own halt-gate-like
question, not a restatement of this one.

**What remains genuinely blocked:** real-time bidirectional audio
streaming and its latency/language-detection accuracy claims (A5.2, A5.6,
A5.7), and everything else that needs an actual speech recognition,
synthesis, or language model call to mean anything. `apps/voice-gateway/src/main.ts`'s
WebSocket endpoint accepts and tracks connections (satisfying "establishes
a media session" as infrastructure) but streams no real audio — there is
nothing to stream until a provider is selected. Modules 7, 8, and 9's FSM
logic is wired to recognized text, fixture NLU, and a fixture embedding
function only; none of it is wired to the WebSocket audio path, since
there is no real
recognizer to produce that text from a real call yet.

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

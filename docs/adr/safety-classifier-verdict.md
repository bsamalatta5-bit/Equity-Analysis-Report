# Module 9: safety classifier — A9.2 verdict

**Status: NOT EVALUATED.** A9.2 sets a numeric bar (recall ≥ 0.98, false-positive
rate ≤ 5%, both measured against real labeled corpora) that this session
cannot clear honestly, for the same underlying reason Module 1's dialect
feasibility gate could not: no real, labeled call data exists here to
measure against. This document exists so that gap is recorded, not
silently assumed away — mirroring `docs/adr/dialect-feasibility-verdict.md`,
which does the same for Module 1.

## What this records

Section 6, Module 9 requires:

- **A9.1** — the safety classifier evaluates every caller turn.
- **A9.2** — classifier recall on a labeled emergency-and-clinical corpus
  of 200 cases is at or above 0.98, and the false-positive rate on a
  labeled non-emergency corpus of 400 cases is at or below 5%. Both values
  are measured per build and recorded. A build below the recall threshold
  fails.
- **A9.3** — a positive result interrupts within one turn, states the
  emergency-services instruction, and attempts transfer within 3 seconds.
- **A9.4** — no assistant output contains diagnostic or treatment content
  under any classifier outcome, proven by a 50-prompt adversarial test set.
- **A9.5** — provider failure transfers the call within 3 seconds, or
  captures a message with a callback request outside escalation active
  hours.
- **A9.6** — the emergency corpus and the adversarial prompt set are
  versioned under `tests/voice/corpora/` and reviewed on every classifier
  change.

## Why this session could not produce a real A9.2 verdict

Measuring real recall and false-positive rate requires a corpus of 200
labeled emergency/clinical cases and 400 labeled non-emergency cases drawn
from real or realistically simulated calls, reviewed by someone competent
to label clinical urgency correctly — mislabeling this corpus would make
the measurement worse than useless. This session has no access to such
labeled call data, no clinical reviewer to construct or validate one, and
no way to responsibly fabricate 600 labels for a safety-critical
classifier without the result being actively misleading. Reporting a
passing number computed from invented labels would be strictly worse than
reporting nothing, because it would look like evidence the classifier is
safe when it is not evidence of anything.

## What was actually built (`apps/voice-gateway/src/safety`)

Unlike Module 1's speech/synthesis providers, the safety classifier itself
is **not** blocked by a missing vendor integration — `safety-classifier.ts`
is a deterministic, bilingual (Arabic/English), rule-based implementation
that runs on already-recognized text and needs no ASR/TTS/LLM provider to
execute. What's missing is not the classifier but the _evidence it meets
A9.2's bar against real speech_, which only a real labeled corpus can
supply. So this session built:

- `safety-classifier.ts` — the classifier itself (A9.1's "evaluates every
  caller turn" is satisfied structurally: `dialogue-state-machine.ts`'s
  `handleTurn` calls it before dispatching to any state-specific handler,
  for every non-silence, non-terminal turn, regardless of dialogue state).
- `clinical-content-guard.ts` — a second, structural guard against A9.4:
  the one assistant output path this codebase doesn't fully control the
  contents of (a knowledge-base-grounded answer) is scanned before it is
  ever spoken; every other assistant utterance in the FSM is a literal
  string written in this repository, already free of clinical content by
  inspection.
- `safety-corpus.ts` — the manifest schema for the real corpora (200
  positive / 400 negative labeled cases per A9.2; 50 adversarial prompts
  per A9.4), with `assertMeetsA92SampleSize()`/`assertMeetsA94SampleSize()`
  enforcing those minimums for any manifest not explicitly marked as a
  placeholder.
- `safety-classifier-evaluation.ts` — computes recall/false-positive-rate
  from a labeled corpus and applies A9.2's thresholds to produce a verdict.
  **`determineSafetyVerdict()` refuses to return PASS or FAIL for any
  corpus flagged `isSyntheticPlaceholder: true`** — it returns
  `NOT_EVALUATED` unconditionally, regardless of the computed numbers, the
  same guardrail `tools/dialect-feasibility-probe/src/report.ts`'s
  `determineVerdict()` applies for Module 1. See
  `safety-classifier-evaluation.spec.ts` for the test proving this.
- `tests/voice/corpora/emergency-clinical.synthetic-example.json` (16
  cases) and `tests/voice/corpora/adversarial-clinical-prompts.synthetic-example.json`
  (10 prompts) — small fixtures explicitly flagged
  `isSyntheticPlaceholder: true`, used only to exercise the tooling above
  and this repository's own integration tests. **Neither is real data, and
  neither was used to compute a real A9.2 verdict.**
- A9.3 (interrupt/transfer) and A9.5 (provider-failure escalation,
  including `apps/api/src/escalation`'s CRUD and
  `apps/voice-gateway/src/degradation/provider-failure.ts`'s active-hours
  routing) are both fully built and tested against a real Postgres
  database — neither depends on A9.2's still-open question.

## What must happen before this can change

1. Commission or otherwise responsibly assemble a real 200-case labeled
   emergency/clinical corpus and a real 400-case labeled non-emergency
   corpus, reviewed by someone qualified to judge clinical urgency
   correctly (A9.2).
2. Assemble a real 50-prompt adversarial set attempting to elicit
   diagnostic or treatment content (A9.4), reviewed the same way.
3. Run `evaluateClassifier()`/`determineSafetyVerdict()` against the real
   corpus with `isSyntheticPlaceholder: false`. If recall ≥ 0.98 and false
   positive rate ≤ 5%, replace this document's status with the real
   **PASS** verdict and record the measured numbers. If either threshold
   is missed, record **FAIL** here — A9.2 says a build below the recall
   threshold fails, so `safety-classifier.ts`'s pattern list would need
   revision (and re-measurement) before this build could be considered
   safe to operate on real calls.
4. Re-review both corpora, and this verdict, on every subsequent change to
   `safety-classifier.ts` or `clinical-content-guard.ts` (A9.6) — a rule
   added to catch one more phrasing can just as easily shift the
   false-positive rate the wrong way.

## Consequence for this build's scope

Nothing in Modules 5-9 is gated on this specific verdict the way Modules
5+ are gated on Module 1's — the classifier runs today, on every call,
using deterministic pattern matching that needs no vendor. What remains
open is strictly the _evidence_ that its real-world recall and
false-positive rate clear A9.2's bar, and until that evidence exists, this
build must not be described as having passed A9.2, however the synthetic
placeholder corpus's numbers look.

# Corpora

`manifest.synthetic-example.json` is a 4-utterance placeholder used only to
exercise this tool's code paths (`run-benchmark`, the WER/rating math, the
report renderer) in CI and local development. It is **not** the corpus
A1.1 requires and must never be used to produce a real go/no-go verdict —
`determineVerdict()` refuses to return PASS/FAIL for any manifest with
`isSyntheticPlaceholder: true`, returning `NOT_EVALUATED` instead.

## What A1.1 actually requires

- 500 telephony-band (8kHz) utterances with human-produced reference
  transcripts.
- Speakers spanning both Najdi and Hijazi dialect, mixed gender, mixed age.
- Real recorded audio, not synthesized or scripted-and-read-by-a-single-
  voice-actor text.

Producing this corpus requires recruiting and recording real speakers (or
licensing an existing telephony-band Saudi-dialect corpus) and having each
utterance transcribed by a human — none of which an autonomous build
session can do. See `docs/adr/dialect-feasibility-verdict.md` for the
current status and what's needed before Module 1's halt gate can be
answered for real.

Once a real corpus exists, drop its manifest here following `corpus.ts`'s
`corpusManifestSchema` with `isSyntheticPlaceholder: false`, and audio files
alongside it (referenced by each utterance's `audioPath`).

-- Module 12 (A12.8a): the Call Detail transcript renders each turn's start
-- timestamp and highlights the active turn during playback. CallTurn had
-- no wall-clock timestamp at all before this, only a `sequence` ordinal.
ALTER TABLE "CallTurn" ADD COLUMN "occurredAt" TIMESTAMPTZ NOT NULL DEFAULT now();

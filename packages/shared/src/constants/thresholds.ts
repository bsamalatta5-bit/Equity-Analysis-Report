/**
 * Numeric thresholds pinned by the build specification (Section 2 and the
 * per-module acceptance criteria). Keep this file as the single source of
 * truth — do not hard-code these values elsewhere.
 */
export const THRESHOLDS = {
  /** A8.2 / 2.2: minimum cosine similarity for a grounded knowledge answer. */
  KNOWLEDGE_SIMILARITY_MIN: 0.75,
  /** A7.2: recognition confidence below this triggers a clarification. */
  SLOT_CONFIDENCE_MIN: 0.65,
  /** A7.2: maximum consecutive clarifications before escalation. */
  MAX_CONSECUTIVE_CLARIFICATIONS: 2,
  /** A1.4: halt-gate word error rate ceiling. */
  DIALECT_WER_MAX: 0.15,
  /** A5.6: minimum language detection accuracy. */
  LANGUAGE_DETECTION_ACCURACY_MIN: 0.95,
  /** A9.2: minimum safety classifier recall. */
  SAFETY_CLASSIFIER_RECALL_MIN: 0.98,
  /** A9.2: maximum safety classifier false-positive rate. */
  SAFETY_CLASSIFIER_FALSE_POSITIVE_MAX: 0.05,
  /** A7.4: seconds of silence before a re-prompt. */
  SILENCE_REPROMPT_SECONDS: 7,
  /** A3.3: access token lifetime. */
  ACCESS_TOKEN_TTL_SECONDS: 15 * 60,
  /** A3.3: refresh token lifetime. */
  REFRESH_TOKEN_TTL_SECONDS: 7 * 24 * 60 * 60,
  /** A3.5: authentication attempts allowed per window. */
  AUTH_RATE_LIMIT_ATTEMPTS: 10,
  /** A3.5: authentication rate limit window. */
  AUTH_RATE_LIMIT_WINDOW_SECONDS: 15 * 60,
  /** A3.1: argon2id memory cost in KiB. */
  ARGON2_MEMORY_COST_KIB: 19456,
  /** A3.1: argon2id time cost. */
  ARGON2_TIME_COST: 2,
  /** A3.1: argon2id parallelism. */
  ARGON2_PARALLELISM: 1,
  /** A5.4: p95 turn latency ceiling, milliseconds. */
  TURN_LATENCY_P95_MS: 1500,
  /** A5.7: p95 added latency for a mid-call language switch. */
  LANGUAGE_SWITCH_ADDED_LATENCY_P95_MS: 400,
  /** A8.2 / A9.3: emergency transfer must be attempted within this window. */
  EMERGENCY_TRANSFER_MAX_SECONDS: 3,
  /** A10.2: signed recording URL validity window. */
  RECORDING_SIGNED_URL_TTL_SECONDS: 300,
  /** A10.3: recording retention period, days. */
  RECORDING_RETENTION_DAYS: 90,
  /** A10.3: transcript retention period, months. */
  TRANSCRIPT_RETENTION_MONTHS: 24,
  /** Section 3 webhook verification: replay window. */
  TELEPHONY_WEBHOOK_REPLAY_WINDOW_SECONDS: 300,
} as const;

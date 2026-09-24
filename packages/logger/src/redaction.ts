/**
 * Constraint 2.5: transcript text, caller phone numbers, recording object
 * keys, and tokens are absent from all log output. This is the only
 * redaction path in the codebase — packages/logger/src/logger.ts is the
 * only place pino is instantiated, and it always routes through
 * `deepRedact`. Do not construct a separate pino instance elsewhere; the
 * static scan in Module 10 (A10.4) fails a build that does.
 */
const SENSITIVE_KEY_PATTERN =
  /(password|passwordhash|totpsecret|token|secret|transcripttext|phone|e164|recordingobjectkey|authorization|cookie|csrftoken|signature|apikey|nonce)/i;

const REDACTED_PLACEHOLDER = "[REDACTED]";

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERN.test(key);
}

export function deepRedact(input: unknown, seen: WeakSet<object> = new WeakSet()): unknown {
  if (input === null || typeof input !== "object") {
    return input;
  }
  if (seen.has(input)) {
    return "[CIRCULAR]";
  }
  seen.add(input);

  if (Array.isArray(input)) {
    return input.map((item) => deepRedact(item, seen));
  }

  if (input instanceof Error) {
    return { name: input.name, message: input.message, stack: input.stack };
  }

  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    output[key] = isSensitiveKey(key) ? REDACTED_PLACEHOLDER : deepRedact(value, seen);
  }
  return output;
}

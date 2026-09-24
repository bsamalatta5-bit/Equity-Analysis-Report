import { AppError, ProviderFailureError, ProviderTimeoutError } from "@voice-receptionist/shared";

/**
 * A6.3: every provider interface method has a timeout and a typed failure
 * path. Wrapping every adapter call through this is what makes that true
 * uniformly instead of per-adapter — an adapter that forgets to time out,
 * or that throws a raw (untyped) Error, is still caught here and
 * converted. An error that is already a typed AppError — including a
 * provider's own domain-specific rejection, like
 * FixtureTelephonyProvider.verifyWebhook's WebhookSignatureInvalidError —
 * is passed through unchanged: it is already a typed failure path, and
 * rewrapping it would destroy the distinction callers (e.g. a guard
 * mapping WebhookSignatureInvalidError to HTTP 401) depend on.
 */
export async function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  providerName: string,
  operationName: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new ProviderTimeoutError(providerName, operationName)), timeoutMs);
  });

  try {
    return await Promise.race([operation, timeout]);
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new ProviderFailureError(providerName, operationName, error);
  } finally {
    clearTimeout(timer);
  }
}

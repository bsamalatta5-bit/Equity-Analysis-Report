import type { ErrorCode } from "../constants/error-codes";

export interface AppErrorOptions {
  readonly httpStatus: number;
  readonly cause?: unknown;
  readonly details?: Readonly<Record<string, unknown>> | undefined;
}

/**
 * Base class for every typed application error. Never thrown or caught as a
 * bare Error — callers switch on `code` to decide handling, and the global
 * exception filter (apps/api/src/common/filters) maps `httpStatus` to the
 * HTTP response without leaking `details` for 403/401 responses.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly httpStatus: number;
  readonly details: Readonly<Record<string, unknown>> | undefined;

  constructor(code: ErrorCode, message: string, options: AppErrorOptions) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "AppError";
    this.code = code;
    this.httpStatus = options.httpStatus;
    this.details = options.details;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Readonly<Record<string, unknown>>) {
    super("VALIDATION_FAILED", message, { httpStatus: 400, details });
    this.name = "ValidationError";
  }
}

export class UnauthenticatedError extends AppError {
  constructor(message = "Authentication is required.") {
    super("UNAUTHENTICATED", message, { httpStatus: 401 });
    this.name = "UnauthenticatedError";
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "This operation is not permitted for the current principal.") {
    super("FORBIDDEN", message, { httpStatus: 403 });
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends AppError {
  constructor(entityType: string, entityId: string) {
    super("NOT_FOUND", `${entityType} ${entityId} was not found.`, { httpStatus: 404 });
    this.name = "NotFoundError";
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: Readonly<Record<string, unknown>>) {
    super("CONFLICT", message, { httpStatus: 409, details });
    this.name = "ConflictError";
  }
}

export class SlotContentionError extends AppError {
  constructor(message = "The requested slot is no longer available.") {
    super("SLOT_CONTENTION", message, { httpStatus: 409 });
    this.name = "SlotContentionError";
  }
}

export class RateLimitedError extends AppError {
  constructor(retryAfterSeconds: number) {
    super("RATE_LIMITED", "Too many attempts. Try again later.", {
      httpStatus: 429,
      details: { retryAfterSeconds },
    });
    this.name = "RateLimitedError";
  }
}

export class AccountLockedError extends AppError {
  constructor(lockedUntil: Date) {
    super("ACCOUNT_LOCKED", "This account is temporarily locked.", {
      httpStatus: 423,
      details: { lockedUntil: lockedUntil.toISOString() },
    });
    this.name = "AccountLockedError";
  }
}

export class RefreshTokenReusedError extends AppError {
  constructor() {
    super("REFRESH_TOKEN_REUSED", "This refresh token has already been used.", { httpStatus: 401 });
    this.name = "RefreshTokenReusedError";
  }
}

export class WebhookSignatureInvalidError extends AppError {
  constructor() {
    super("WEBHOOK_SIGNATURE_INVALID", "Webhook signature verification failed.", { httpStatus: 401 });
    this.name = "WebhookSignatureInvalidError";
  }
}

export class WebhookReplayDetectedError extends AppError {
  constructor() {
    super("WEBHOOK_REPLAY_DETECTED", "This webhook nonce was already processed or the timestamp is stale.", {
      httpStatus: 401,
    });
    this.name = "WebhookReplayDetectedError";
  }
}

export class ProviderTimeoutError extends AppError {
  constructor(providerName: string, operationName: string) {
    super("PROVIDER_TIMEOUT", `${providerName} timed out during ${operationName}.`, { httpStatus: 504 });
    this.name = "ProviderTimeoutError";
  }
}

export class ProviderFailureError extends AppError {
  constructor(providerName: string, operationName: string, cause?: unknown) {
    super("PROVIDER_FAILURE", `${providerName} failed during ${operationName}.`, {
      httpStatus: 502,
      cause,
    });
    this.name = "ProviderFailureError";
  }
}

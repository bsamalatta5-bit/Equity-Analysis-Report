import { describe, expect, it } from "vitest";
import {
  AccountLockedError,
  AppError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  RateLimitedError,
  RefreshTokenReusedError,
  SlotContentionError,
  UnauthenticatedError,
  ValidationError,
} from "./app-error";

describe("AppError subclasses", () => {
  it("ValidationError carries httpStatus 400 and the given details", () => {
    const error = new ValidationError("bad input", { field: "email" });
    expect(error).toBeInstanceOf(AppError);
    expect(error.code).toBe("VALIDATION_FAILED");
    expect(error.httpStatus).toBe(400);
    expect(error.details).toEqual({ field: "email" });
  });

  it("UnauthenticatedError defaults to a generic message and 401", () => {
    const error = new UnauthenticatedError();
    expect(error.code).toBe("UNAUTHENTICATED");
    expect(error.httpStatus).toBe(401);
  });

  it("ForbiddenError defaults to 403", () => {
    expect(new ForbiddenError().httpStatus).toBe(403);
  });

  it("NotFoundError includes the entity type and id in its message", () => {
    const error = new NotFoundError("Appointment", "abc-123");
    expect(error.httpStatus).toBe(404);
    expect(error.message).toContain("Appointment");
    expect(error.message).toContain("abc-123");
  });

  it("ConflictError carries httpStatus 409", () => {
    expect(new ConflictError("cannot transition").httpStatus).toBe(409);
  });

  it("SlotContentionError is a 409 with a stable code", () => {
    const error = new SlotContentionError();
    expect(error.code).toBe("SLOT_CONTENTION");
    expect(error.httpStatus).toBe(409);
  });

  it("RateLimitedError is a 429 carrying retryAfterSeconds", () => {
    const error = new RateLimitedError(120);
    expect(error.httpStatus).toBe(429);
    expect(error.details).toEqual({ retryAfterSeconds: 120 });
  });

  it("AccountLockedError is a 423 carrying an ISO lockedUntil", () => {
    const lockedUntil = new Date("2030-01-01T00:00:00.000Z");
    const error = new AccountLockedError(lockedUntil);
    expect(error.httpStatus).toBe(423);
    expect(error.details).toEqual({ lockedUntil: "2030-01-01T00:00:00.000Z" });
  });

  it("RefreshTokenReusedError is a 401 with a distinct code from UnauthenticatedError", () => {
    const error = new RefreshTokenReusedError();
    expect(error.httpStatus).toBe(401);
    expect(error.code).toBe("REFRESH_TOKEN_REUSED");
  });

  it("every AppError subclass is an instanceof Error and AppError", () => {
    const error = new ForbiddenError();
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(AppError);
  });
});

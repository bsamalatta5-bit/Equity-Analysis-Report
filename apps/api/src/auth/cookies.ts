import type { CookieOptions, Response } from "express";
import { THRESHOLDS } from "@voice-receptionist/shared";
import { SESSION_COOKIE_NAME } from "../common/guards/session.guard";
import { CSRF_COOKIE_NAME } from "../common/guards/csrf.guard";

// Deliberately NOT __Host-prefixed: that prefix requires Path=/ exactly
// (RFC 6265bis), but this cookie is intentionally scoped to /auth/refresh
// only, so it is never sent on ordinary API calls. It still carries every
// other __Host- guarantee: httpOnly, Secure, SameSite=Strict.
export const REFRESH_COOKIE_NAME = "refresh_token";

// __Host- prefixed cookies must not set Domain and must set Path=/ and
// Secure (browser-enforced), which is exactly what A3.2 requires.
const baseHttpOnlyCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: "strict",
  path: "/",
};

export function setSessionCookies(
  res: Response,
  sessionToken: string,
  refreshToken: string,
  csrfToken: string,
): void {
  res.cookie(SESSION_COOKIE_NAME, sessionToken, {
    ...baseHttpOnlyCookieOptions,
    maxAge: THRESHOLDS.ACCESS_TOKEN_TTL_SECONDS * 1000,
  });
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
    ...baseHttpOnlyCookieOptions,
    path: "/auth/refresh",
    maxAge: THRESHOLDS.REFRESH_TOKEN_TTL_SECONDS * 1000,
  });
  // Readable by client JS so it can echo it back as the X-CSRF-Token header
  // (double-submit pattern, A3.9) — must not be httpOnly.
  res.cookie(CSRF_COOKIE_NAME, csrfToken, {
    httpOnly: false,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: THRESHOLDS.ACCESS_TOKEN_TTL_SECONDS * 1000,
  });
}

export function clearSessionCookies(res: Response): void {
  res.clearCookie(SESSION_COOKIE_NAME, { path: "/" });
  res.clearCookie(REFRESH_COOKIE_NAME, { path: "/auth/refresh" });
  res.clearCookie(CSRF_COOKIE_NAME, { path: "/" });
}

import type { UserRole } from "@voice-receptionist/shared";
import { apiFetch } from "../api/client";

export interface SessionInfo {
  readonly userId: string;
  readonly tenantId: string;
  readonly role: UserRole;
  readonly assignedLocationIds: readonly string[];
}

export function fetchSession(): Promise<SessionInfo> {
  return apiFetch<SessionInfo>("/auth/session");
}

export type LoginResponse =
  | { status: "session" }
  | { status: "totp_required"; challengeToken: string }
  | { status: "totp_enrollment_required"; challengeToken: string };

export function login(email: string, password: string): Promise<LoginResponse> {
  return apiFetch<LoginResponse>("/auth/login", { method: "POST", body: { email, password } });
}

export function verifyTotp(challengeToken: string, code: string): Promise<{ status: "session" }> {
  return apiFetch("/auth/totp/verify", { method: "POST", body: { challengeToken, code } });
}

export function startTotpEnrollment(challengeToken: string): Promise<{ secret: string; otpauthUri: string }> {
  return apiFetch("/auth/totp/enroll/start", { method: "POST", body: { challengeToken } });
}

export function confirmTotpEnrollment(challengeToken: string, code: string): Promise<{ status: "session" }> {
  return apiFetch("/auth/totp/enroll/confirm", { method: "POST", body: { challengeToken, code } });
}

export function logout(): Promise<{ status: "ok" }> {
  return apiFetch("/auth/logout", { method: "POST" });
}

export function changePassword(currentPassword: string, newPassword: string): Promise<{ status: "ok" }> {
  return apiFetch("/auth/password", { method: "PATCH", body: { currentPassword, newPassword } });
}

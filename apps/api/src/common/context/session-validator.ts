import type { HumanPrincipal } from "@voice-receptionist/shared";

export const SESSION_VALIDATOR = Symbol("SESSION_VALIDATOR");

/**
 * Decouples SessionGuard (common/) from the concrete session store
 * (auth/session.service.ts) so common/ never imports from a feature
 * module. AuthModule binds this token to SessionService.
 */
export interface SessionValidator {
  validateSessionToken(sessionToken: string): Promise<HumanPrincipal | null>;
}

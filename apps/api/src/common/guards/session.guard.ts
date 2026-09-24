import { CanActivate, ExecutionContext, Inject, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { UnauthenticatedError } from "@voice-receptionist/shared";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";
import { SESSION_VALIDATOR, type SessionValidator } from "../context/session-validator";
import type { RequestWithPrincipal } from "../types/request-with-principal";

export const SESSION_COOKIE_NAME = "__Host-session";

/**
 * A3.2/A3.6: resolves the __Host-session cookie to a HumanPrincipal for
 * every route except those marked @Public(). Authorization by role is a
 * separate concern (RolesGuard) — this guard only establishes identity.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(SESSION_VALIDATOR) private readonly sessionValidator: SessionValidator,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithPrincipal>();

    // Voice gateway and telephony-partner requests authenticate through
    // their own guards on machine-only routes (A3.8) and never carry this
    // cookie; those routes are always marked @Public() here and re-verified
    // by TelephonyWebhookGuard / VoiceGatewayGuard (Module 5, apps/voice-gateway).
    const sessionToken = request.cookies?.[SESSION_COOKIE_NAME] as string | undefined;
    if (!sessionToken) {
      throw new UnauthenticatedError();
    }

    const principal = await this.sessionValidator.validateSessionToken(sessionToken);
    if (!principal) {
      throw new UnauthenticatedError();
    }

    request.principal = principal;
    return true;
  }
}

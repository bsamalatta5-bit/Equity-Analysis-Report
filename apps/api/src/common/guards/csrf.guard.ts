import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AppError } from "@voice-receptionist/shared";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";
import type { RequestWithPrincipal } from "../types/request-with-principal";

export const CSRF_COOKIE_NAME = "csrf_token";
export const CSRF_HEADER_NAME = "x-csrf-token";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * A3.9: double-submit-cookie CSRF protection on every state-changing
 * endpoint reachable by a cookie-authenticated principal. csrf_token is a
 * non-httpOnly, Secure, SameSite=Strict cookie issued alongside the session
 * (auth/session.service.ts); a cross-site request cannot read it to set the
 * matching header, since SameSite=Strict also stops the cookie itself from
 * being sent on a cross-site navigation or fetch. Machine principals
 * (mTLS/HMAC/workload identity, A3.8) never carry this cookie and are
 * always reached through @Public() routes with their own verification.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const request = context.switchToHttp().getRequest<RequestWithPrincipal>();

    if (isPublic || SAFE_METHODS.has(request.method)) {
      return true;
    }
    if (request.principal?.kind !== "human_user") {
      return true;
    }

    const cookieToken = request.cookies?.[CSRF_COOKIE_NAME] as string | undefined;
    const headerToken = request.headers[CSRF_HEADER_NAME];

    if (!cookieToken || !headerToken || cookieToken !== headerToken) {
      throw new AppError("CSRF_TOKEN_INVALID", "Missing or mismatched CSRF token.", { httpStatus: 403 });
    }

    return true;
  }
}

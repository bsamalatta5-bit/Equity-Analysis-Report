import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ForbiddenError, type UserRole } from "@voice-receptionist/shared";
import { ROLES_KEY } from "../decorators/roles.decorator";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";
import type { RequestWithPrincipal } from "../types/request-with-principal";

/**
 * A3.6/A3.7: enforces the per-route @Roles(...) allow-list against the
 * principal SessionGuard attached to the request. Routes with no @Roles()
 * metadata are allowed for any authenticated human principal but never for
 * machine principals, which must instead be scoped to their own @Public()
 * routes guarded separately (A3.8).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const requiredRoles = this.reflector.getAllAndOverride<readonly UserRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest<RequestWithPrincipal>();
    const principal = request.principal;

    if (!principal || principal.kind !== "human_user") {
      throw new ForbiddenError();
    }

    if (requiredRoles && requiredRoles.length > 0 && !requiredRoles.includes(principal.role)) {
      throw new ForbiddenError();
    }

    return true;
  }
}

import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { HumanPrincipal, Principal } from "@voice-receptionist/shared";
import type { RequestWithPrincipal } from "../types/request-with-principal";

export const CurrentPrincipal = createParamDecorator((_data: unknown, ctx: ExecutionContext): Principal => {
  const request = ctx.switchToHttp().getRequest<RequestWithPrincipal>();
  if (!request.principal) {
    throw new Error("CurrentPrincipal used on a route not protected by SessionGuard.");
  }
  return request.principal;
});

/** Convenience variant for routes that are only ever reached by a human (cookie) session. */
export const CurrentHumanPrincipal = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): HumanPrincipal => {
    const request = ctx.switchToHttp().getRequest<RequestWithPrincipal>();
    if (!request.principal || request.principal.kind !== "human_user") {
      throw new Error("CurrentHumanPrincipal used on a route without an authenticated human session.");
    }
    return request.principal;
  },
);

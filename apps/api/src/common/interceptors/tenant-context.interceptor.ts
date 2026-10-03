import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { firstValueFrom, from, Observable } from "rxjs";
import { PrismaService } from "../prisma/prisma.service";
import { TenantContext } from "../context/tenant-context";
import type { RequestWithPrincipal } from "../types/request-with-principal";

/**
 * Opens the interactive transaction that carries this request's RLS
 * session variables (Section 5.1c) and makes it available to every service
 * via TenantContext for the lifetime of the request. Routes with no
 * principal (public routes: login, TOTP challenge, refresh, health) are
 * passed through untouched — those flows manage their own scoped Prisma
 * access explicitly (see auth/session.service.ts).
 */
@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContext,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<RequestWithPrincipal>();
    const principal = request.principal;

    if (!principal) {
      return next.handle();
    }

    if (principal.kind === "telephony_partner" || principal.kind === "retention_job") {
      // Neither carries a single tenantId (telephony webhooks resolve the
      // tenant per phone number inside the handler; the retention job
      // sweeps every tenant). Neither is reachable from this build phase's
      // routes; handled explicitly here so the type switch stays exhaustive.
      return next.handle();
    }

    const tenantId = principal.kind === "human_user" ? principal.tenantId : principal.tenantId;
    const isPlatformOperator = principal.kind === "human_user" && principal.role === "platform_operator";

    return from(
      this.prisma.withTenant(tenantId, isPlatformOperator, (tx) =>
        this.tenantContext.run({ tx, tenantId }, () => firstValueFrom(next.handle())),
      ),
    );
  }
}

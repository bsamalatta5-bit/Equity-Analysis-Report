import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import type { Response } from "express";
import { Observable, tap } from "rxjs";
import type { RequestWithPrincipal } from "../types/request-with-principal";

/**
 * Surfaces pino-http's per-request id (assigned in main.ts) as both
 * request.correlationId, for services that want to tag log lines, and the
 * X-Correlation-Id response header, so a caller can hand it back for
 * support/debugging without any transcript or PII ever being logged.
 */
@Injectable()
export class RequestContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const httpContext = context.switchToHttp();
    const request = httpContext.getRequest<RequestWithPrincipal & { id?: string }>();
    const response = httpContext.getResponse<Response>();

    const correlationId = request.id ?? "unknown";
    request.correlationId = correlationId;
    response.setHeader("X-Correlation-Id", correlationId);

    return next.handle().pipe(tap());
  }
}

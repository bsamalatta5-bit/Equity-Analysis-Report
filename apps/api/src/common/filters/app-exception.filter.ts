import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Inject } from "@nestjs/common";
import type { Response } from "express";
import type { Logger } from "pino";
import { AppError } from "@voice-receptionist/shared";
import { APP_LOGGER } from "../logging/app-logger.module";
import type { RequestWithPrincipal } from "../types/request-with-principal";

interface ErrorResponseBody {
  readonly code: string;
  readonly message: string;
  readonly correlationId: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

/**
 * Maps every thrown error to a stable {code, message} body (coding standard
 * 7.5). AppError subclasses carry their own httpStatus/code; anything else
 * — a bug, a driver error — becomes a generic 500 with no internal detail
 * leaked to the client. 401/403 responses never include `details`
 * (Constraint 2.7: forbidden operations return no resource data).
 */
@Catch()
export class AppExceptionFilter implements ExceptionFilter {
  constructor(@Inject(APP_LOGGER) private readonly logger: Logger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<RequestWithPrincipal & { id?: string }>();
    const correlationId = request.correlationId ?? request.id ?? "unknown";

    if (exception instanceof AppError) {
      const includeDetails = exception.httpStatus !== 401 && exception.httpStatus !== 403;
      const body: ErrorResponseBody = {
        code: exception.code,
        message: exception.message,
        correlationId,
        ...(includeDetails && exception.details ? { details: exception.details } : {}),
      };
      response.status(exception.httpStatus).json(body);
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body: ErrorResponseBody = {
        code: status === 404 ? "NOT_FOUND" : "VALIDATION_FAILED",
        message: exception.message,
        correlationId,
      };
      response.status(status).json(body);
      return;
    }

    this.logger.error({ correlationId, err: exception }, "Unhandled exception");
    const body: ErrorResponseBody = {
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred.",
      correlationId,
    };
    response.status(500).json(body);
  }
}

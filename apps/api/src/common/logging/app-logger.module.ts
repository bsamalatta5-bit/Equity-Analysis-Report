import { Global, Module } from "@nestjs/common";
import { createLogger } from "@voice-receptionist/logger";

export const APP_LOGGER = Symbol("APP_LOGGER");

/**
 * The only logger provider in this app (coding standard 7.6). Every
 * service injects APP_LOGGER instead of constructing `new Logger(...)` or
 * calling console.*, so every log line passes through the redaction
 * formatter in packages/logger (Constraint 2.5).
 */
@Global()
@Module({
  providers: [
    {
      provide: APP_LOGGER,
      useFactory: () => createLogger({ serviceName: "api" }),
    },
  ],
  exports: [APP_LOGGER],
})
export class AppLoggerModule {}

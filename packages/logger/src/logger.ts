import type { Writable } from "node:stream";
import { pino, type Logger, type LoggerOptions } from "pino";
import { deepRedact } from "./redaction";

export interface CreateLoggerConfig {
  readonly serviceName: string;
  readonly level?: string;
  /** Test-only: overrides the write destination (default: stdout). */
  readonly destination?: Writable;
}

/**
 * The only permitted way to obtain a logger in this codebase (coding
 * standard 7.6: direct console calls and ad hoc pino instances are
 * prohibited outside build scripts). Every structured field passed to a log
 * call is deep-redacted before serialization, so there is no bypass path.
 */
export function createLogger(config: CreateLoggerConfig): Logger {
  const options: LoggerOptions = {
    level: config.level ?? process.env["LOG_LEVEL"] ?? "info",
    base: { service: config.serviceName },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      log(object) {
        return deepRedact(object) as Record<string, unknown>;
      },
    },
  };
  return config.destination ? pino(options, config.destination) : pino(options);
}

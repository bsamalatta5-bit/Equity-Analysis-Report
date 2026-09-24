import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma, PrismaClient } from "@prisma/client";
import type { Logger } from "pino";
import { APP_LOGGER } from "../logging/app-logger.module";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertUuid(value: string, label: string): void {
  if (!UUID_PATTERN.test(value)) {
    throw new Error(`${label} must be a UUID, got: ${JSON.stringify(value)}`);
  }
}

/**
 * Every tenant-scoped request holds its own connection for the duration of
 * its RLS transaction (withTenant), so the pool must be sized for real
 * request concurrency, not Prisma's small per-CPU default — that default
 * is what made A4.3's 50-concurrent-booking scenario fail with "Unable to
 * start a transaction in the given time" before this was added. Callers
 * may still override via DATABASE_URL's own query string.
 */
function withPoolDefaults(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  if (!url.searchParams.has("connection_limit")) {
    url.searchParams.set("connection_limit", "25");
  }
  if (!url.searchParams.has("pool_timeout")) {
    url.searchParams.set("pool_timeout", "20");
  }
  return url.toString();
}

const TRANSACTION_OPTIONS = { maxWait: 15_000, timeout: 15_000 };

/**
 * The API's only PrismaClient instance. It always connects as DATABASE_URL
 * (the least-privileged `voice_app` role), never the schema's own
 * DATABASE_MIGRATOR_URL default — Postgres superusers bypass row-level
 * security unconditionally, so using the migrator connection here would
 * silently defeat tenant isolation (Section 5.1c, A2.3).
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(
    config: ConfigService,
    @Inject(APP_LOGGER) private readonly logger: Logger,
  ) {
    super({
      datasources: {
        db: { url: withPoolDefaults(config.getOrThrow<string>("DATABASE_URL")) },
      },
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.info("Connected to database as the voice_app application role.");
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /**
   * Runs `callback` inside an interactive transaction with the RLS session
   * variables set (Section 5.1c). `SET LOCAL` does not accept bound
   * parameters over the Postgres wire protocol, so `tenantId` is validated
   * as a well-formed UUID and interpolated directly — never pass anything
   * here that was not already validated (e.g. by Zod's `.uuid()`).
   */
  async withTenant<T>(
    tenantId: string,
    isPlatformOperator: boolean,
    callback: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    assertUuid(tenantId, "tenantId");
    return this.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant_id = '${tenantId}'`);
      if (isPlatformOperator) {
        await tx.$executeRawUnsafe(`SET LOCAL app.is_platform_operator = 'true'`);
      }
      return callback(tx);
    }, TRANSACTION_OPTIONS);
  }

  /** Cross-tenant reads for platform_operator, with no tenant row narrowed by id. */
  async withPlatformOperator<T>(callback: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL app.is_platform_operator = 'true'`);
      return callback(tx);
    }, TRANSACTION_OPTIONS);
  }
}

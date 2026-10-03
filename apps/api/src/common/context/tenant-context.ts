import { AsyncLocalStorage } from "node:async_hooks";
import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

export interface TenantContextStore {
  /** The interactive-transaction Prisma client with RLS session variables set for this request. */
  readonly tx: Prisma.TransactionClient;
  readonly tenantId: string | undefined;
}

/**
 * Every tenant-scoped database read or write in this codebase must go
 * through the transactional client stored here, never through
 * PrismaService's raw client directly — the raw client has no
 * `app.current_tenant_id` session variable set, so row-level security
 * (Section 5.1c) makes every tenant-scoped query against it return zero
 * rows. TenantContextInterceptor is the only place this store is populated.
 */
@Injectable()
export class TenantContext {
  private readonly storage = new AsyncLocalStorage<TenantContextStore>();

  run<T>(store: TenantContextStore, callback: () => Promise<T>): Promise<T> {
    return this.storage.run(store, callback);
  }

  /** Throws if called outside a request that went through TenantContextInterceptor. */
  getStore(): TenantContextStore {
    const store = this.storage.getStore();
    if (!store) {
      throw new Error(
        "TenantContext.getStore() called outside a request scoped by TenantContextInterceptor. " +
          "Every controller route that touches tenant-scoped data must be guarded by SessionGuard " +
          "and intercepted by TenantContextInterceptor.",
      );
    }
    return store;
  }

  get tx(): Prisma.TransactionClient {
    return this.getStore().tx;
  }
}

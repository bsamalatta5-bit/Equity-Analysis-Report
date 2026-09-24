import { Prisma, PrismaClient } from "@prisma/client";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertUuid(value: string, label: string): void {
  if (!UUID_PATTERN.test(value)) {
    throw new Error(`${label} must be a UUID, got: ${JSON.stringify(value)}`);
  }
}

/**
 * The voice gateway's own PrismaClient, mirroring apps/api's
 * common/prisma/prisma.service.ts: always DATABASE_URL (the
 * least-privileged voice_app role, never DATABASE_MIGRATOR_URL), and
 * every tenant-scoped query goes through withTenant so the RLS session
 * variable is set (Section 5.1c). The two services duplicate this small
 * amount of code deliberately — they are separately deployable processes,
 * per Section 4's architecture, not a shared runtime.
 */
export function createVoiceGatewayPrismaClient(databaseUrl: string): PrismaClient {
  return new PrismaClient({ datasources: { db: { url: databaseUrl } } });
}

export async function withTenant<T>(
  prisma: PrismaClient,
  tenantId: string,
  callback: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  assertUuid(tenantId, "tenantId");
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL app.current_tenant_id = '${tenantId}'`);
      return callback(tx);
    },
    { maxWait: 15_000, timeout: 15_000 },
  );
}

export interface ResolvedPhoneNumberTenant {
  readonly tenantId: string;
  readonly locationId: string;
}

/** A3.8: "tenant resolved from the provisioned number record only." Bypasses RLS via a SECURITY DEFINER SQL function (see the migration). */
export async function resolveTenantForPhoneNumber(
  prisma: PrismaClient,
  e164Number: string,
): Promise<ResolvedPhoneNumberTenant | null> {
  const rows = await prisma.$queryRaw<{ tenant_id: string; location_id: string }[]>`
    SELECT * FROM resolve_tenant_for_phone_number(${e164Number})
  `;
  const row = rows[0];
  return row ? { tenantId: row.tenant_id, locationId: row.location_id } : null;
}

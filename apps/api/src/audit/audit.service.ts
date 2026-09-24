import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { ActorPrincipalType } from "@voice-receptionist/shared";

export interface RecordAuditEntryInput {
  readonly tx: Prisma.TransactionClient;
  readonly tenantId: string;
  readonly actorUserId: string | null;
  readonly actorPrincipalType: ActorPrincipalType;
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly ipAddress?: string | null;
}

/**
 * A4.4: every appointment status transition — and, more generally, every
 * mutation this build treats as audit-worthy — writes an entry naming the
 * actor, the principal type, and the source. Callers pass the same `tx`
 * they used for the mutation itself, so the audit write commits atomically
 * with it. AuditLog is append-only at the database level (Section 5.1d);
 * this service never updates or deletes a row, only inserts.
 */
@Injectable()
export class AuditService {
  async record(input: RecordAuditEntryInput): Promise<void> {
    await input.tx.auditLog.create({
      data: {
        tenantId: input.tenantId,
        actorUserId: input.actorUserId,
        actorPrincipalType: input.actorPrincipalType,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        ipAddress: input.ipAddress ?? null,
      },
    });
  }
}

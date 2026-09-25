import type { PrismaClient, Prisma } from "@prisma/client";
import { withTenant } from "../common/prisma-client";
import type { BookingOutcome } from "./types";

const EXCLUSION_CONSTRAINT_NAME = "appointment_no_overlap";

function isSlotContentionError(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === "object" &&
    "message" in error &&
    typeof (error as { message: unknown }).message === "string" &&
    (error as { message: string }).message.includes(EXCLUSION_CONSTRAINT_NAME)
  );
}

export interface BookingWriteInput {
  readonly tenantId: string;
  readonly locationId: string;
  readonly staffMemberId: string;
  readonly serviceId: string;
  readonly startAt: Date;
  readonly callId: string;
  readonly contactPhoneE164: string;
}

/**
 * A7.1: the only place a voice_call appointment is written, and it is
 * reached only from the Write state after Confirmation — see
 * dialogue-state-machine.ts. Relies on the same database exclusion
 * constraint as apps/api's AppointmentsService.book (A4.3), not
 * application locking, for double-booking safety under concurrency.
 */
export async function writeConfirmedAppointment(
  prisma: PrismaClient,
  input: BookingWriteInput,
): Promise<BookingOutcome> {
  return withTenant(prisma, input.tenantId, async (tx: Prisma.TransactionClient) => {
    const service = await tx.service.findUniqueOrThrow({ where: { id: input.serviceId } });
    const endAt = new Date(input.startAt.getTime() + service.durationMinutes * 60_000);

    const contact = await tx.contact.upsert({
      where: { tenantId_phoneE164: { tenantId: input.tenantId, phoneE164: input.contactPhoneE164 } },
      create: { tenantId: input.tenantId, phoneE164: input.contactPhoneE164 },
      update: {},
    });

    try {
      const appointment = await tx.appointment.create({
        data: {
          locationId: input.locationId,
          staffMemberId: input.staffMemberId,
          serviceId: input.serviceId,
          contactId: contact.id,
          startAt: input.startAt,
          endAt,
          status: "confirmed",
          source: "voice_call",
          callId: input.callId,
        },
      });
      return { kind: "booked", appointmentId: appointment.id };
    } catch (error) {
      if (isSlotContentionError(error)) {
        return { kind: "contention", alternatives: [] };
      }
      throw error;
    }
  });
}

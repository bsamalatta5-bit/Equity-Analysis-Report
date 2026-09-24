import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  ConflictError,
  NotFoundError,
  SlotContentionError,
  type ActorPrincipalType,
  type AppointmentStatus,
  type CreateAppointmentRequest,
  type ListAppointmentsQuery,
  type RescheduleAppointmentRequest,
} from "@voice-receptionist/shared";
import { AuditService } from "../audit/audit.service";
import { omitUndefined } from "../common/utils/omit-undefined";

const EXCLUSION_CONSTRAINT_NAME = "appointment_no_overlap";

/** A4.3: the DB exclusion constraint (not application locking) is the only thing preventing double-booking. */
export function isSlotContentionError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError || error instanceof Prisma.PrismaClientUnknownRequestError) {
    return error.message.includes(EXCLUSION_CONSTRAINT_NAME);
  }
  return false;
}

export const VALID_TRANSITIONS: Record<AppointmentStatus, readonly AppointmentStatus[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["completed", "cancelled", "no_show"],
  cancelled: [],
  completed: [],
  no_show: [],
};

@Injectable()
export class AppointmentsService {
  constructor(private readonly audit: AuditService) {}

  async list(tx: Prisma.TransactionClient, tenantId: string, query: ListAppointmentsQuery) {
    return tx.appointment.findMany({
      where: {
        locationId: query.locationId,
        ...(query.status ? { status: query.status } : {}),
        ...(query.fromDate || query.toDate
          ? {
              startAt: {
                ...(query.fromDate ? { gte: query.fromDate } : {}),
                ...(query.toDate ? { lte: query.toDate } : {}),
              },
            }
          : {}),
      },
      orderBy: { startAt: "asc" },
    });
  }

  /**
   * A7.1 (enforced by the caller / Zod schema, not this method): a
   * voice_call booking must already carry `callerConfirmed: true`, set only
   * once the dialogue state machine's Confirmation state recorded the
   * caller's spoken confirmation of service, staff, date, and time. This
   * method performs the actual write — the single place any appointment
   * row is created — and relies entirely on the database exclusion
   * constraint (Section 5.1a) for double-booking safety, not application
   * locking, so it is correct under concurrent requests (A4.3).
   */
  async book(
    tx: Prisma.TransactionClient,
    tenantId: string,
    actorUserId: string | null,
    actorPrincipalType: ActorPrincipalType,
    request: CreateAppointmentRequest,
  ) {
    const service = await tx.service.findUnique({ where: { id: request.serviceId } });
    if (!service || service.locationId !== request.locationId) {
      throw new NotFoundError("Service", request.serviceId);
    }

    const staffMember = await tx.staffMember.findUnique({ where: { id: request.staffMemberId } });
    if (!staffMember || staffMember.locationId !== request.locationId) {
      throw new NotFoundError("StaffMember", request.staffMemberId);
    }

    const endAt = new Date(request.startAt.getTime() + service.durationMinutes * 60_000);

    const contact = await tx.contact.upsert({
      where: { tenantId_phoneE164: { tenantId, phoneE164: request.contact.phoneE164 } },
      create: { tenantId, ...omitUndefined(request.contact) },
      update: omitUndefined({
        displayName: request.contact.displayName,
        preferredLanguage: request.contact.preferredLanguage,
      }),
    });

    let appointment;
    try {
      appointment = await tx.appointment.create({
        data: {
          locationId: request.locationId,
          staffMemberId: request.staffMemberId,
          serviceId: request.serviceId,
          contactId: contact.id,
          startAt: request.startAt,
          endAt,
          status: "confirmed",
          source: request.source,
          callId: request.source === "voice_call" ? request.callId : null,
        },
      });
    } catch (error) {
      if (isSlotContentionError(error)) {
        throw new SlotContentionError();
      }
      throw error;
    }

    await this.audit.record({
      tx,
      tenantId,
      actorUserId,
      actorPrincipalType,
      action: `appointment.create[status=confirmed,source=${request.source}]`,
      entityType: "Appointment",
      entityId: appointment.id,
    });

    return appointment;
  }

  async reschedule(
    tx: Prisma.TransactionClient,
    tenantId: string,
    actorUserId: string,
    appointmentId: string,
    data: RescheduleAppointmentRequest,
  ) {
    const existing = await tx.appointment.findUnique({ where: { id: appointmentId } });
    if (!existing) {
      throw new NotFoundError("Appointment", appointmentId);
    }
    const service = await tx.service.findUniqueOrThrow({ where: { id: existing.serviceId } });
    const endAt = new Date(data.startAt.getTime() + service.durationMinutes * 60_000);

    let appointment;
    try {
      appointment = await tx.appointment.update({
        where: { id: appointmentId },
        data: {
          startAt: data.startAt,
          endAt,
          staffMemberId: data.staffMemberId ?? existing.staffMemberId,
        },
      });
    } catch (error) {
      if (isSlotContentionError(error)) {
        // A7.3: the caller returns to AvailabilityCheck with alternatives —
        // that UX lives in apps/voice-gateway's dialogue state machine
        // (Module 7); this API only needs to surface the typed conflict.
        throw new SlotContentionError();
      }
      throw error;
    }

    await this.audit.record({
      tx,
      tenantId,
      actorUserId,
      actorPrincipalType: "human_user",
      action: "appointment.reschedule",
      entityType: "Appointment",
      entityId: appointmentId,
    });

    return appointment;
  }

  async updateStatus(
    tx: Prisma.TransactionClient,
    tenantId: string,
    actorUserId: string | null,
    actorPrincipalType: ActorPrincipalType,
    appointmentId: string,
    nextStatus: AppointmentStatus,
  ) {
    const existing = await tx.appointment.findUnique({ where: { id: appointmentId } });
    if (!existing) {
      throw new NotFoundError("Appointment", appointmentId);
    }
    if (!VALID_TRANSITIONS[existing.status].includes(nextStatus)) {
      throw new ConflictError(`Cannot transition appointment from ${existing.status} to ${nextStatus}.`);
    }

    const appointment = await tx.appointment.update({
      where: { id: appointmentId },
      data: { status: nextStatus },
    });

    // A4.4: every status transition writes an audit entry naming the
    // actor, the principal type, and the source.
    await this.audit.record({
      tx,
      tenantId,
      actorUserId,
      actorPrincipalType,
      action: `appointment.status_transition[from=${existing.status},to=${nextStatus},source=${existing.source}]`,
      entityType: "Appointment",
      entityId: appointmentId,
    });

    return appointment;
  }
}

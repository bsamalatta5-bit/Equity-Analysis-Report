import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import {
  NotFoundError,
  type CreateAvailabilityRuleRequest,
  type CreateBlockedPeriodRequest,
  type OpenSlot,
  type OpenSlotQuery,
} from "@voice-receptionist/shared";
import { AuditService } from "../audit/audit.service";
import { omitUndefined } from "../common/utils/omit-undefined";

interface Interval {
  readonly startAt: Date;
  readonly endAt: Date;
}

function overlaps(a: Interval, b: Interval): boolean {
  return a.startAt < b.endAt && b.startAt < a.endAt;
}

function formatDateInTimezone(date: Date): string {
  // date is a plain calendar day cursor (constructed from y/m/d only, no
  // time-of-day component that a timezone conversion could shift), so a
  // UTC-based format is safe and avoids pulling in another dependency.
  return date.toISOString().slice(0, 10);
}

function addMinutesToTimeOfDay(timeOfDay: string, minutes: number): string {
  const [hoursText, minutesText] = timeOfDay.split(":");
  const totalMinutes = Number(hoursText) * 60 + Number(minutesText) + minutes;
  const hours = Math.floor(totalMinutes / 60)
    .toString()
    .padStart(2, "0");
  const mins = (totalMinutes % 60).toString().padStart(2, "0");
  return `${hours}:${mins}`;
}

function compareTimeOfDay(a: string, b: string): number {
  return a.localeCompare(b);
}

/** Module 4 core: Section 6, Module 4, A4.1-A4.4. */
@Injectable()
export class AvailabilityService {
  constructor(private readonly audit: AuditService) {}

  async listRules(tx: Prisma.TransactionClient, staffMemberId: string) {
    return tx.availabilityRule.findMany({ where: { staffMemberId }, orderBy: { weekday: "asc" } });
  }

  async createRule(
    tx: Prisma.TransactionClient,
    tenantId: string,
    actorUserId: string,
    data: CreateAvailabilityRuleRequest,
  ) {
    const rule = await tx.availabilityRule.create({ data: omitUndefined(data) });
    await this.audit.record({
      tx,
      tenantId,
      actorUserId,
      actorPrincipalType: "human_user",
      action: "availability_rule.create",
      entityType: "AvailabilityRule",
      entityId: rule.id,
    });
    return rule;
  }

  async createBlockedPeriod(
    tx: Prisma.TransactionClient,
    tenantId: string,
    actorUserId: string,
    data: CreateBlockedPeriodRequest,
  ) {
    const period = await tx.blockedPeriod.create({ data });
    await this.audit.record({
      tx,
      tenantId,
      actorUserId,
      actorPrincipalType: "human_user",
      action: "blocked_period.create",
      entityType: "BlockedPeriod",
      entityId: period.id,
    });
    return period;
  }

  /**
   * A4.1: returns only slots that satisfy availability rules, exclude
   * blocked periods, exclude existing (non-cancelled) appointments, and
   * respect the location's timezone.
   *
   * A4.2: kept fast at scale by fetching blocked periods and appointments
   * once per staff member for the whole query range (both indexed on
   * staffMemberId — Appointment additionally on (locationId, startAt)) and
   * checking overlap in memory against that bounded set, rather than
   * issuing a query per candidate slot.
   */
  async findOpenSlots(tx: Prisma.TransactionClient, query: OpenSlotQuery): Promise<OpenSlot[]> {
    const location = await tx.location.findUniqueOrThrow({ where: { id: query.locationId } });
    const service = await tx.service.findUniqueOrThrow({ where: { id: query.serviceId } });
    if (service.locationId !== query.locationId) {
      throw new NotFoundError("Service", query.serviceId);
    }

    const staffMembers = query.staffMemberId
      ? [
          await tx.staffMember.findUniqueOrThrow({
            where: { id: query.staffMemberId },
          }),
        ]
      : await tx.staffMember.findMany({ where: { locationId: query.locationId, active: true } });

    const results: OpenSlot[] = [];

    for (const staffMember of staffMembers) {
      if (staffMember.locationId !== query.locationId) {
        continue;
      }

      const [rules, blockedPeriods, appointments] = await Promise.all([
        tx.availabilityRule.findMany({ where: { staffMemberId: staffMember.id } }),
        tx.blockedPeriod.findMany({
          where: { staffMemberId: staffMember.id, startAt: { lt: query.toDate }, endAt: { gt: query.fromDate } },
        }),
        tx.appointment.findMany({
          where: {
            staffMemberId: staffMember.id,
            status: { not: "cancelled" },
            startAt: { lt: query.toDate },
            endAt: { gt: query.fromDate },
          },
        }),
      ]);

      const busy: Interval[] = [...blockedPeriods, ...appointments];

      // Iterate LOCAL calendar dates, not UTC ones: a location east of UTC
      // (e.g. Asia/Riyadh, +03:00) has its "next local day" begin before
      // the matching UTC calendar date rolls over, so a naive UTC-date
      // cursor bounded by [fromDate, toDate) would silently skip local
      // slots that fall inside the requested absolute window but whose
      // wall-clock date label is one day ahead in UTC terms.
      const zonedFrom = toZonedTime(query.fromDate, location.timezone);
      const zonedToInclusive = toZonedTime(query.toDate, location.timezone);
      const cursorEnd = new Date(
        Date.UTC(zonedToInclusive.getUTCFullYear(), zonedToInclusive.getUTCMonth(), zonedToInclusive.getUTCDate()),
      );

      for (
        let cursor = new Date(Date.UTC(zonedFrom.getUTCFullYear(), zonedFrom.getUTCMonth(), zonedFrom.getUTCDate()));
        cursor <= cursorEnd;
        cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000)
      ) {
        const weekday = cursor.getUTCDay();
        const dateText = formatDateInTimezone(cursor);

        const applicableRules = rules.filter((rule) => {
          if (rule.weekday !== weekday) return false;
          if (rule.effectiveFrom > cursor) return false;
          if (rule.effectiveTo && rule.effectiveTo < cursor) return false;
          return true;
        });

        for (const rule of applicableRules) {
          let slotStart = rule.startTime;
          while (compareTimeOfDay(addMinutesToTimeOfDay(slotStart, service.durationMinutes), rule.endTime) <= 0) {
            const slotEnd = addMinutesToTimeOfDay(slotStart, service.durationMinutes);
            const startAt = fromZonedTime(`${dateText}T${slotStart}:00`, location.timezone);
            const endAt = fromZonedTime(`${dateText}T${slotEnd}:00`, location.timezone);
            const candidate: Interval = { startAt, endAt };

            if (startAt >= query.fromDate && endAt <= query.toDate && !busy.some((b) => overlaps(b, candidate))) {
              results.push({ staffMemberId: staffMember.id, startAt, endAt });
            }

            slotStart = slotEnd;
          }
        }
      }
    }

    return results.sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  }
}

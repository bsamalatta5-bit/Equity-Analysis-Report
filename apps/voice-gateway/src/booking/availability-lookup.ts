import type { Prisma } from "@prisma/client";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import type { OpenSlotCandidate } from "./types";

interface Interval {
  readonly startAt: Date;
  readonly endAt: Date;
}

function overlaps(a: Interval, b: Interval): boolean {
  return a.startAt < b.endAt && b.startAt < a.endAt;
}

function formatDateInTimezone(date: Date): string {
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

const SEARCH_HORIZON_DAYS = 14;

export interface FindNearestOpenSlotsParams {
  readonly staffMemberId: string;
  readonly serviceId: string;
  /** Only candidates starting at or after this instant are returned. */
  readonly after: Date;
  readonly count: number;
}

/**
 * A4.1-style generator (apps/api/src/availability/availability.service.ts),
 * trimmed for Module 7's narrower need: the next `count` open slots for one
 * staff member from a point in time, rather than every slot in an explicit
 * range. Kept as a separate, smaller implementation rather than importing
 * apps/api's service — the two apps are separately deployable processes
 * (see docs/adr/dialect-feasibility-verdict.md's note on
 * apps/voice-gateway's direct-Postgres access), so this is the same
 * deliberate small duplication, not an oversight.
 */
export async function findNearestOpenSlots(
  tx: Prisma.TransactionClient,
  params: FindNearestOpenSlotsParams,
): Promise<OpenSlotCandidate[]> {
  const staffMember = await tx.staffMember.findUniqueOrThrow({ where: { id: params.staffMemberId } });
  const location = await tx.location.findUniqueOrThrow({ where: { id: staffMember.locationId } });
  const service = await tx.service.findUniqueOrThrow({ where: { id: params.serviceId } });

  const horizonEnd = new Date(params.after.getTime() + SEARCH_HORIZON_DAYS * 24 * 60 * 60 * 1000);

  const [rules, blockedPeriods, appointments] = await Promise.all([
    tx.availabilityRule.findMany({ where: { staffMemberId: params.staffMemberId } }),
    tx.blockedPeriod.findMany({
      where: {
        staffMemberId: params.staffMemberId,
        startAt: { lt: horizonEnd },
        endAt: { gt: params.after },
      },
    }),
    tx.appointment.findMany({
      where: {
        staffMemberId: params.staffMemberId,
        status: { not: "cancelled" },
        startAt: { lt: horizonEnd },
        endAt: { gt: params.after },
      },
    }),
  ]);
  const busy: Interval[] = [...blockedPeriods, ...appointments];

  const results: OpenSlotCandidate[] = [];
  const zonedFrom = toZonedTime(params.after, location.timezone);
  let cursor = new Date(
    Date.UTC(zonedFrom.getUTCFullYear(), zonedFrom.getUTCMonth(), zonedFrom.getUTCDate()),
  );
  const cursorEnd = new Date(cursor.getTime() + SEARCH_HORIZON_DAYS * 24 * 60 * 60 * 1000);

  while (cursor <= cursorEnd && results.length < params.count) {
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

        if (startAt >= params.after && !busy.some((b) => overlaps(b, candidate))) {
          results.push({ staffMemberId: params.staffMemberId, startAt, endAt });
          if (results.length >= params.count) {
            return results;
          }
        }

        slotStart = slotEnd;
      }
    }

    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
  }

  return results;
}

/** Whether the exact requested [startAt, startAt+duration) is currently open for this staff member. */
export async function isExactSlotOpen(
  tx: Prisma.TransactionClient,
  params: { staffMemberId: string; serviceId: string; startAt: Date },
): Promise<boolean> {
  const candidates = await findNearestOpenSlots(tx, {
    staffMemberId: params.staffMemberId,
    serviceId: params.serviceId,
    after: params.startAt,
    count: 1,
  });
  return candidates.length > 0 && candidates[0]!.startAt.getTime() === params.startAt.getTime();
}

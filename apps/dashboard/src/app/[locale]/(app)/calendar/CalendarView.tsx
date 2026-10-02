"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { addDays, addWeeks, eachDayOfInterval, endOfWeek, format, startOfWeek, subWeeks } from "date-fns";
import type { Locale } from "../../../../lib/i18n/locales";
import { useI18n } from "../../../../lib/i18n/provider";
import { useCurrentSession } from "../../../../lib/auth/session-context";
import { useLocations } from "../../../../lib/locations/use-locations";
import { listAppointments, type AppointmentSummary } from "../../../../lib/appointments/api";
import { APPOINTMENT_STATUS_LABEL_KEYS } from "../../../../lib/appointments/status-labels";
import { maskPhoneE164 } from "../../../../lib/format/phone";
import { Card } from "../../../../components/ui/Card";
import { Badge } from "../../../../components/ui/Badge";
import { Button } from "../../../../components/ui/Button";
import { AsyncStateView } from "../../../../components/states/AsyncStateView";

export function CalendarView({ locale }: { locale: Locale }) {
  const { t } = useI18n();
  const session = useCurrentSession();
  const locationsQuery = useLocations(session.tenantId);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));

  const locationId = selectedLocationId ?? locationsQuery.data?.[0]?.id;

  return (
    <div className="flex flex-col gap-token-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-text-primary">{t("appointment.calendarTitle")}</h1>
        <Link href={`/${locale}/appointments/new`}>
          <Button>{t("appointment.newAppointmentButton")}</Button>
        </Link>
      </div>

      <AsyncStateView
        isLoading={locationsQuery.isLoading}
        isError={locationsQuery.isError}
        error={locationsQuery.error}
        data={locationsQuery.data}
        isEmpty={(data) => data.length === 0}
        onRetry={() => void locationsQuery.refetch()}
      >
        {(locations) => (
          <div className="flex flex-col gap-token-4">
            {locations.length > 1 ? (
              <label className="flex flex-col gap-token-1 text-sm">
                <span className="font-medium text-text-primary">{t("operations.locationLabel")}</span>
                <select
                  className="min-h-[2.5rem] max-w-xs rounded-token border border-border bg-surface px-token-3 text-sm"
                  value={locationId}
                  onChange={(event) => setSelectedLocationId(event.target.value)}
                >
                  {locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <div className="flex items-center gap-token-3">
              <Button variant="secondary" onClick={() => setWeekStart((current) => subWeeks(current, 1))}>
                {t("common.back")}
              </Button>
              <p className="text-sm font-medium text-text-primary">
                {format(weekStart, "MMM d")} – {format(endOfWeek(weekStart), "MMM d, yyyy")}
              </p>
              <Button variant="secondary" onClick={() => setWeekStart((current) => addWeeks(current, 1))}>
                {t("common.next")}
              </Button>
            </div>

            {locationId ? (
              <WeekAppointments
                locale={locale}
                tenantId={session.tenantId}
                locationId={locationId}
                weekStart={weekStart}
              />
            ) : null}
          </div>
        )}
      </AsyncStateView>
    </div>
  );
}

function WeekAppointments({
  locale,
  tenantId,
  locationId,
  weekStart,
}: {
  locale: Locale;
  tenantId: string;
  locationId: string;
  weekStart: Date;
}) {
  const { t } = useI18n();
  const weekEnd = useMemo(() => endOfWeek(weekStart), [weekStart]);
  const days = useMemo(() => eachDayOfInterval({ start: weekStart, end: weekEnd }), [weekStart, weekEnd]);

  const appointmentsQuery = useQuery({
    queryKey: ["appointments", tenantId, locationId, weekStart.toISOString()],
    queryFn: () =>
      listAppointments(tenantId, {
        locationId,
        fromDate: weekStart.toISOString(),
        toDate: addDays(weekEnd, 1).toISOString(),
      }),
  });

  return (
    <AsyncStateView
      isLoading={appointmentsQuery.isLoading}
      isError={appointmentsQuery.isError}
      error={appointmentsQuery.error}
      data={appointmentsQuery.data}
      isEmpty={(data) => data.length === 0}
      emptyTitle={t("operations.noAppointmentsToday")}
      onRetry={() => void appointmentsQuery.refetch()}
    >
      {(appointments) => (
        <div className="flex flex-col gap-token-4">
          {days.map((day) => {
            const dayKey = format(day, "yyyy-MM-dd");
            const dayAppointments = appointments.filter(
              (appointment) => format(new Date(appointment.startAt), "yyyy-MM-dd") === dayKey,
            );
            return (
              <Card key={dayKey}>
                <h2 className="text-sm font-semibold text-text-primary">
                  {day.toLocaleDateString(locale, { weekday: "long", month: "short", day: "numeric" })}
                </h2>
                {dayAppointments.length === 0 ? (
                  <p className="mt-token-2 text-sm text-text-secondary">{t("common.emptyGeneric")}</p>
                ) : (
                  <ul className="mt-token-2 flex flex-col gap-token-2">
                    {dayAppointments.map((appointment) => (
                      <AppointmentRow key={appointment.id} locale={locale} appointment={appointment} />
                    ))}
                  </ul>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </AsyncStateView>
  );
}

function AppointmentRow({ locale, appointment }: { locale: Locale; appointment: AppointmentSummary }) {
  const { t } = useI18n();
  return (
    <li>
      <Link
        href={`/${locale}/appointments/${appointment.id}`}
        className="flex items-center justify-between rounded-token p-token-2 text-sm hover:bg-surface-raised"
      >
        <span>
          {new Date(appointment.startAt).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })} ·{" "}
          {appointment.service.nameEn} · {appointment.staffMember.displayName} ·{" "}
          {maskPhoneE164(appointment.contact.phoneE164)}
        </span>
        <Badge tone={appointment.status === "confirmed" ? "success" : "neutral"}>
          {t(APPOINTMENT_STATUS_LABEL_KEYS[appointment.status])}
        </Badge>
      </Link>
    </li>
  );
}

"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { endOfDay, startOfDay } from "date-fns";
import type { Locale } from "../../../lib/i18n/locales";
import { useI18n } from "../../../lib/i18n/provider";
import { useCurrentSession } from "../../../lib/auth/session-context";
import { listLocations } from "../../../lib/locations/api";
import { listAppointments } from "../../../lib/appointments/api";
import { APPOINTMENT_STATUS_LABEL_KEYS } from "../../../lib/appointments/status-labels";
import { listCalls } from "../../../lib/calls/api";
import { CALL_DISPOSITION_LABEL_KEYS } from "../../../lib/calls/disposition-labels";
import { getUsage } from "../../../lib/usage/api";
import { maskPhoneE164 } from "../../../lib/format/phone";
import { Card } from "../../../components/ui/Card";
import { Badge } from "../../../components/ui/Badge";
import { AsyncStateView } from "../../../components/states/AsyncStateView";

export function OperationsOverview({ locale }: { locale: Locale }) {
  const { t } = useI18n();
  const session = useCurrentSession();
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);

  const locationsQuery = useQuery({
    queryKey: ["locations", session.tenantId],
    queryFn: () => listLocations(session.tenantId),
  });

  const locationId = selectedLocationId ?? locationsQuery.data?.[0]?.id;

  return (
    <div className="flex flex-col gap-token-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-text-primary">{t("operations.title")}</h1>
        {session.role === "tenant_owner" ? (
          <Link href={`/${locale}/onboarding`} className="text-sm text-brand-600 hover:underline">
            {t("home.onboardingPrompt")}
          </Link>
        ) : null}
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
          <div className="flex flex-col gap-token-2">
            {locations.length > 1 ? (
              <label className="flex flex-col gap-token-1 text-sm">
                <span className="font-medium text-text-primary">{t("operations.locationLabel")}</span>
                <select
                  className="min-h-[2.5rem] rounded-token border border-border bg-surface px-token-3 text-sm"
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
            {locationId ? (
              <LocationOverview locale={locale} tenantId={session.tenantId} locationId={locationId} />
            ) : null}
          </div>
        )}
      </AsyncStateView>

      {session.role === "tenant_owner" || session.role === "platform_operator" ? (
        <UsageSection tenantId={session.tenantId} />
      ) : null}
    </div>
  );
}

function LocationOverview({
  locale,
  tenantId,
  locationId,
}: {
  locale: Locale;
  tenantId: string;
  locationId: string;
}) {
  const { t } = useI18n();
  const { fromDate, toDate } = useMemo(() => {
    const now = new Date();
    return { fromDate: startOfDay(now).toISOString(), toDate: endOfDay(now).toISOString() };
  }, []);

  const appointmentsQuery = useQuery({
    queryKey: ["appointments", tenantId, locationId, fromDate, toDate],
    queryFn: () => listAppointments(tenantId, { locationId, fromDate, toDate }),
  });

  const callsQuery = useQuery({
    queryKey: ["calls", tenantId, locationId],
    queryFn: () => listCalls(tenantId, locationId),
  });

  return (
    <div className="grid grid-cols-1 gap-token-4 md:grid-cols-2">
      <Card>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-primary">
            {t("operations.todayAppointmentsTitle")}
          </h2>
          <Link href={`/${locale}/calendar`} className="text-sm text-brand-600 hover:underline">
            {t("operations.viewCalendarLink")}
          </Link>
        </div>
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
            <ul className="mt-token-3 flex flex-col gap-token-2">
              {appointments.slice(0, 5).map((appointment) => (
                <li key={appointment.id} className="flex items-center justify-between text-sm">
                  <span>
                    {new Date(appointment.startAt).toLocaleTimeString(locale, {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}{" "}
                    · {appointment.service.nameEn} · {maskPhoneE164(appointment.contact.phoneE164)}
                  </span>
                  <Badge tone={appointment.status === "confirmed" ? "success" : "neutral"}>
                    {t(APPOINTMENT_STATUS_LABEL_KEYS[appointment.status])}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </AsyncStateView>
      </Card>

      <Card>
        <h2 className="text-sm font-semibold text-text-primary">{t("operations.recentCallsTitle")}</h2>
        <AsyncStateView
          isLoading={callsQuery.isLoading}
          isError={callsQuery.isError}
          error={callsQuery.error}
          data={callsQuery.data}
          isEmpty={(data) => data.length === 0}
          emptyTitle={t("operations.noCallsYet")}
          onRetry={() => void callsQuery.refetch()}
        >
          {(calls) => (
            <ul className="mt-token-3 flex flex-col gap-token-2">
              {calls.slice(0, 5).map((call) => (
                <li key={call.id} className="flex items-center justify-between text-sm">
                  <span>{new Date(call.startedAt).toLocaleString(locale)}</span>
                  <Badge tone={call.containmentFlag ? "success" : "warning"}>
                    {call.disposition ? t(CALL_DISPOSITION_LABEL_KEYS[call.disposition]) : "—"}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </AsyncStateView>
      </Card>
    </div>
  );
}

function UsageSection({ tenantId }: { tenantId: string }) {
  const { t } = useI18n();
  const usageQuery = useQuery({
    queryKey: ["usage", tenantId],
    queryFn: () => getUsage(tenantId),
  });

  return (
    <Card>
      <h2 className="text-sm font-semibold text-text-primary">{t("operations.usageTitle")}</h2>
      <AsyncStateView
        isLoading={usageQuery.isLoading}
        isError={usageQuery.isError}
        error={usageQuery.error}
        data={usageQuery.data}
        isEmpty={(data) => data.usageRecords.length === 0}
        onRetry={() => void usageQuery.refetch()}
      >
        {(usage) => {
          const current = usage.usageRecords[0];
          return (
            <dl className="mt-token-3 grid grid-cols-2 gap-token-2 text-sm">
              <dt className="text-text-secondary">{t("operations.billableMinutesLabel")}</dt>
              <dd className="font-medium text-text-primary">{current?.billableMinutes ?? 0}</dd>
              <dt className="text-text-secondary">{t("operations.includedMinutesLabel")}</dt>
              <dd className="font-medium text-text-primary">{usage.subscription?.includedMinutes ?? 0}</dd>
            </dl>
          );
        }}
      </AsyncStateView>
    </Card>
  );
}

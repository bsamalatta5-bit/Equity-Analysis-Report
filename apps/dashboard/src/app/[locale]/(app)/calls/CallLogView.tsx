"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Locale } from "../../../../lib/i18n/locales";
import { useI18n } from "../../../../lib/i18n/provider";
import { useCurrentSession } from "../../../../lib/auth/session-context";
import { useLocations } from "../../../../lib/locations/use-locations";
import { listCalls } from "../../../../lib/calls/api";
import { CALL_DISPOSITION_LABEL_KEYS } from "../../../../lib/calls/disposition-labels";
import { maskPhoneE164 } from "../../../../lib/format/phone";
import { Card } from "../../../../components/ui/Card";
import { Badge } from "../../../../components/ui/Badge";
import { AsyncStateView } from "../../../../components/states/AsyncStateView";

export function CallLogView({ locale }: { locale: Locale }) {
  const { t } = useI18n();
  const session = useCurrentSession();
  const locationsQuery = useLocations(session.tenantId);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const locationId = selectedLocationId ?? locationsQuery.data?.[0]?.id;

  return (
    <div className="flex flex-col gap-token-6">
      <h1 className="text-xl font-semibold text-text-primary">{t("calls.logTitle")}</h1>

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
            {locationId ? (
              <CallList locale={locale} tenantId={session.tenantId} locationId={locationId} />
            ) : null}
          </div>
        )}
      </AsyncStateView>
    </div>
  );
}

function CallList({
  locale,
  tenantId,
  locationId,
}: {
  locale: Locale;
  tenantId: string;
  locationId: string;
}) {
  const { t } = useI18n();
  const callsQuery = useQuery({
    queryKey: ["calls", tenantId, locationId],
    queryFn: () => listCalls(tenantId, locationId),
  });

  return (
    <AsyncStateView
      isLoading={callsQuery.isLoading}
      isError={callsQuery.isError}
      error={callsQuery.error}
      data={callsQuery.data}
      isEmpty={(data) => data.length === 0}
      emptyTitle={t("calls.noCalls")}
      onRetry={() => void callsQuery.refetch()}
    >
      {(calls) => (
        <Card>
          <ul className="flex flex-col divide-y divide-border">
            {calls.map((call) => (
              <li key={call.id}>
                <Link
                  href={`/${locale}/calls/${call.id}`}
                  className="flex items-center justify-between gap-token-3 rounded-token p-token-3 text-sm hover:bg-surface-raised"
                >
                  <span>
                    {new Date(call.startedAt).toLocaleString(locale)}
                    {call.contact ? ` · ${maskPhoneE164(call.contact.phoneE164)}` : ""}
                  </span>
                  <Badge tone={call.containmentFlag ? "success" : "warning"}>
                    {call.disposition ? t(CALL_DISPOSITION_LABEL_KEYS[call.disposition]) : "—"}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </AsyncStateView>
  );
}

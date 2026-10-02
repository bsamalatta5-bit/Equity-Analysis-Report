"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Locale } from "../../../../../lib/i18n/locales";
import { useI18n } from "../../../../../lib/i18n/provider";
import { useCurrentSession } from "../../../../../lib/auth/session-context";
import { useLocations } from "../../../../../lib/locations/use-locations";
import { getCallTranscript, issueRecordingUrl, type CallTurn } from "../../../../../lib/calls/api";
import { CALL_DISPOSITION_LABEL_KEYS } from "../../../../../lib/calls/disposition-labels";
import { ApiError } from "../../../../../lib/api/client";
import { Card } from "../../../../../components/ui/Card";
import { Badge } from "../../../../../components/ui/Badge";
import { AsyncStateView } from "../../../../../components/states/AsyncStateView";
import { AudioPlayer } from "../../../../../components/calls/AudioPlayer";

const API_ORIGIN = process.env["NEXT_PUBLIC_API_ORIGIN"] ?? "http://localhost:3001";

export function CallDetail({ locale, callId }: { locale: Locale; callId: string }) {
  const { t } = useI18n();
  const session = useCurrentSession();
  // The transcript endpoint is scoped under a location, but the caller only
  // knows the callId — every one of the tenant's locations is tried until
  // the one RLS actually lets this call through responds.
  const locationsQuery = useLocations(session.tenantId);

  return (
    <div className="flex flex-col gap-token-6">
      <h1 className="text-xl font-semibold text-text-primary">{t("calls.detailTitle")}</h1>
      <AsyncStateView
        isLoading={locationsQuery.isLoading}
        isError={locationsQuery.isError}
        error={locationsQuery.error}
        data={locationsQuery.data}
        isEmpty={(data) => data.length === 0}
        onRetry={() => void locationsQuery.refetch()}
      >
        {(locations) => (
          <CallDetailForLocations
            locale={locale}
            tenantId={session.tenantId}
            role={session.role}
            callId={callId}
            locationIds={locations.map((location) => location.id)}
          />
        )}
      </AsyncStateView>
    </div>
  );
}

function CallDetailForLocations({
  locale,
  tenantId,
  role,
  callId,
  locationIds,
}: {
  locale: Locale;
  tenantId: string;
  role: string;
  callId: string;
  locationIds: readonly string[];
}) {
  const { t } = useI18n();
  const [activeTurnId, setActiveTurnId] = useState<string | null>(null);

  const transcriptQuery = useQuery({
    queryKey: ["call-transcript", tenantId, callId],
    queryFn: async () => {
      for (const locationId of locationIds) {
        try {
          return await getCallTranscript(tenantId, locationId, callId);
        } catch (error) {
          if (error instanceof ApiError && error.status === 404) {
            continue;
          }
          throw error;
        }
      }
      throw new ApiError(404, { code: "NOT_FOUND", message: "Call not found.", correlationId: "unknown" });
    },
  });

  const canSeeRecording = role === "tenant_owner" || role === "location_manager";
  const recordingQuery = useQuery({
    queryKey: ["call-recording", tenantId, callId, transcriptQuery.data?.call.locationId],
    queryFn: async () => {
      try {
        return await issueRecordingUrl(tenantId, transcriptQuery.data!.call.locationId, callId);
      } catch (error) {
        // A recording that was never made (no consent, or not yet uploaded)
        // isn't a failure to report and retry — it's this call's own state.
        if (error instanceof ApiError && error.status === 404) {
          return null;
        }
        throw error;
      }
    },
    enabled: canSeeRecording && !!transcriptQuery.data,
    retry: false,
  });

  return (
    <AsyncStateView
      isLoading={transcriptQuery.isLoading}
      isError={transcriptQuery.isError}
      error={transcriptQuery.error}
      data={transcriptQuery.data}
      onRetry={() => void transcriptQuery.refetch()}
    >
      {({ call, turns }) => {
        const durationSeconds =
          call.endedAt && call.startedAt
            ? (new Date(call.endedAt).getTime() - new Date(call.startedAt).getTime()) / 1000
            : null;

        const onTimeUpdate = (currentTime: number) => {
          const callStart = new Date(call.startedAt).getTime();
          let active: CallTurn | null = null;
          for (const turn of turns) {
            const offsetSeconds = (new Date(turn.occurredAt).getTime() - callStart) / 1000;
            if (offsetSeconds <= currentTime) {
              active = turn;
            }
          }
          setActiveTurnId(active?.id ?? null);
        };

        return (
          <div className="flex flex-col gap-token-6">
            <Card className="max-w-xl">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-text-primary">
                  {new Date(call.startedAt).toLocaleString(locale)}
                </h2>
                <Badge tone={call.containmentFlag ? "success" : "warning"}>
                  {call.disposition ? t(CALL_DISPOSITION_LABEL_KEYS[call.disposition]) : "—"}
                </Badge>
              </div>
              <dl className="mt-token-4 grid grid-cols-2 gap-token-2 text-sm">
                <dt className="text-text-secondary">{t("calls.startedAtLabel")}</dt>
                <dd className="text-text-primary">{new Date(call.startedAt).toLocaleString(locale)}</dd>
                {durationSeconds !== null ? (
                  <>
                    <dt className="text-text-secondary">{t("calls.durationLabel")}</dt>
                    <dd className="text-text-primary">{Math.round(durationSeconds)}s</dd>
                  </>
                ) : null}
                {call.contact ? (
                  <>
                    {/* A12.7: the detail view is the authorized, unmasked rendering of this number. */}
                    <dt className="text-text-secondary">{t("calls.contactPhoneLabel")}</dt>
                    <dd className="text-text-primary" dir="ltr">
                      {call.contact.phoneE164}
                    </dd>
                  </>
                ) : null}
              </dl>
            </Card>

            {canSeeRecording ? (
              <Card className="max-w-xl">
                <h2 className="text-sm font-semibold text-text-primary">{t("calls.recordingTitle")}</h2>
                <div className="mt-token-3">
                  <AsyncStateView
                    isLoading={recordingQuery.isLoading}
                    isError={recordingQuery.isError}
                    error={recordingQuery.error}
                    data={recordingQuery.data}
                    isEmpty={(data) => data === null}
                    emptyTitle={t("calls.recordingUnavailable")}
                    onRetry={() => void recordingQuery.refetch()}
                  >
                    {(recording) =>
                      recording ? (
                        <AudioPlayer
                          src={`${API_ORIGIN}${recording.url}`}
                          accessibleName={`${t("calls.recordingTitle")} — ${new Date(call.startedAt).toLocaleString(locale)}`}
                          onTimeUpdate={onTimeUpdate}
                        />
                      ) : null
                    }
                  </AsyncStateView>
                </div>
              </Card>
            ) : null}

            <Card className="max-w-xl">
              <h2 className="text-sm font-semibold text-text-primary">{t("calls.transcriptTitle")}</h2>
              {turns.length === 0 ? (
                <p className="mt-token-3 text-sm text-text-secondary">{t("calls.noTranscript")}</p>
              ) : (
                <ol className="mt-token-3 flex flex-col gap-token-3">
                  {turns.map((turn) => (
                    <li
                      key={turn.id}
                      aria-current={turn.id === activeTurnId ? "true" : undefined}
                      className={`rounded-token p-token-2 text-sm ${
                        turn.id === activeTurnId ? "bg-brand-100" : ""
                      }`}
                    >
                      <p className="text-xs font-medium text-text-secondary">
                        {turn.speaker === "caller" ? t("calls.speakerCaller") : t("calls.speakerAssistant")} ·{" "}
                        {new Date(turn.occurredAt).toLocaleTimeString(locale, {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </p>
                      <p className="text-text-primary">{turn.transcriptText}</p>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          </div>
        );
      }}
    </AsyncStateView>
  );
}

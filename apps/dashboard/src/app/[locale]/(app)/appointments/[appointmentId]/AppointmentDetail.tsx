"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { AppointmentStatus } from "@voice-receptionist/shared";
import type { Locale } from "../../../../../lib/i18n/locales";
import { useI18n } from "../../../../../lib/i18n/provider";
import { useCurrentSession } from "../../../../../lib/auth/session-context";
import { getAppointment, updateAppointmentStatus } from "../../../../../lib/appointments/api";
import { APPOINTMENT_STATUS_LABEL_KEYS } from "../../../../../lib/appointments/status-labels";
import { ApiError, NetworkError } from "../../../../../lib/api/client";
import { Card } from "../../../../../components/ui/Card";
import { Badge } from "../../../../../components/ui/Badge";
import { Button } from "../../../../../components/ui/Button";
import { AsyncStateView } from "../../../../../components/states/AsyncStateView";

export function AppointmentDetail({ locale, appointmentId }: { locale: Locale; appointmentId: string }) {
  const { t } = useI18n();
  const session = useCurrentSession();
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingStatus, setPendingStatus] = useState<AppointmentStatus | null>(null);

  const queryKey = ["appointment", session.tenantId, appointmentId];
  const appointmentQuery = useQuery({
    queryKey,
    queryFn: () => getAppointment(session.tenantId, appointmentId),
  });

  const transition = async (status: AppointmentStatus) => {
    setActionError(null);
    setPendingStatus(status);
    try {
      await updateAppointmentStatus(session.tenantId, appointmentId, status);
      await queryClient.invalidateQueries({ queryKey });
    } catch (error) {
      if (error instanceof NetworkError) {
        setActionError(t("common.offlineBanner"));
      } else if (error instanceof ApiError) {
        setActionError(error.message);
      } else {
        setActionError(t("common.errorGeneric"));
      }
    } finally {
      setPendingStatus(null);
    }
  };

  return (
    <div className="flex flex-col gap-token-6">
      <h1 className="text-xl font-semibold text-text-primary">{t("appointment.detailTitle")}</h1>
      <AsyncStateView
        isLoading={appointmentQuery.isLoading}
        isError={appointmentQuery.isError}
        error={appointmentQuery.error}
        data={appointmentQuery.data}
        onRetry={() => void appointmentQuery.refetch()}
      >
        {(appointment) => (
          <Card className="max-w-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-text-primary">{appointment.service.nameEn}</h2>
              <Badge tone={appointment.status === "confirmed" ? "success" : "neutral"}>
                {t(APPOINTMENT_STATUS_LABEL_KEYS[appointment.status])}
              </Badge>
            </div>
            <dl className="mt-token-4 grid grid-cols-2 gap-token-2 text-sm">
              <dt className="text-text-secondary">{t("appointment.staffLabel")}</dt>
              <dd className="text-text-primary">{appointment.staffMember.displayName}</dd>
              <dt className="text-text-secondary">{t("appointment.dateLabel")}</dt>
              <dd className="text-text-primary">{new Date(appointment.startAt).toLocaleString(locale)}</dd>
              <dt className="text-text-secondary">{t("appointment.contactNameLabel")}</dt>
              <dd className="text-text-primary">{appointment.contact.displayName ?? "—"}</dd>
              {/* A12.7: the detail view is the authorized, unmasked rendering of this number. */}
              <dt className="text-text-secondary">{t("appointment.contactPhoneLabel")}</dt>
              <dd className="text-text-primary" dir="ltr">
                {appointment.contact.phoneE164}
              </dd>
            </dl>

            {appointment.status === "confirmed" ? (
              <div className="mt-token-6 flex flex-wrap gap-token-2">
                <Button
                  variant="secondary"
                  isLoading={pendingStatus === "completed"}
                  onClick={() => void transition("completed")}
                >
                  {t("appointment.markCompletedButton")}
                </Button>
                <Button
                  variant="secondary"
                  isLoading={pendingStatus === "no_show"}
                  onClick={() => void transition("no_show")}
                >
                  {t("appointment.markNoShowButton")}
                </Button>
                <Button
                  variant="danger"
                  isLoading={pendingStatus === "cancelled"}
                  onClick={() => void transition("cancelled")}
                >
                  {t("appointment.cancelButton")}
                </Button>
              </div>
            ) : null}
            {actionError ? (
              <p role="alert" className="mt-token-3 text-sm text-danger">
                {actionError}
              </p>
            ) : null}
          </Card>
        )}
      </AsyncStateView>
    </div>
  );
}

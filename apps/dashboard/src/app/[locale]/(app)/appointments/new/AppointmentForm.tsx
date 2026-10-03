"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useQuery } from "@tanstack/react-query";
import { endOfDay, format, startOfDay } from "date-fns";
import type { Locale } from "../../../../../lib/i18n/locales";
import { useI18n } from "../../../../../lib/i18n/provider";
import { useCurrentSession } from "../../../../../lib/auth/session-context";
import { useLocations } from "../../../../../lib/locations/use-locations";
import { listServices, listStaff } from "../../../../../lib/catalog/api";
import { createAppointment, listOpenSlots, type OpenSlot } from "../../../../../lib/appointments/api";
import { ApiError, NetworkError } from "../../../../../lib/api/client";
import { Card } from "../../../../../components/ui/Card";
import { Button } from "../../../../../components/ui/Button";
import { TextField } from "../../../../../components/ui/TextField";
import { AsyncStateView } from "../../../../../components/states/AsyncStateView";

interface ContactFormValues {
  phoneE164: string;
  displayName: string;
}

export function AppointmentForm({ locale }: { locale: Locale }) {
  const { t } = useI18n();
  const router = useRouter();
  const session = useCurrentSession();
  const locationsQuery = useLocations(session.tenantId);

  const [locationId, setLocationId] = useState<string | null>(null);
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [staffMemberId, setStaffMemberId] = useState<string>("");
  const [date, setDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [selectedSlot, setSelectedSlot] = useState<OpenSlot | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [created, setCreated] = useState(false);

  const effectiveLocationId = locationId ?? locationsQuery.data?.[0]?.id ?? null;

  const servicesQuery = useQuery({
    queryKey: ["services", session.tenantId, effectiveLocationId],
    queryFn: () => listServices(session.tenantId, effectiveLocationId!),
    enabled: !!effectiveLocationId,
  });
  const staffQuery = useQuery({
    queryKey: ["staff", session.tenantId, effectiveLocationId],
    queryFn: () => listStaff(session.tenantId, effectiveLocationId!),
    enabled: !!effectiveLocationId,
  });

  const slotsQuery = useQuery({
    queryKey: ["open-slots", session.tenantId, effectiveLocationId, serviceId, staffMemberId, date],
    queryFn: () =>
      listOpenSlots(session.tenantId, effectiveLocationId!, {
        serviceId: serviceId!,
        ...(staffMemberId ? { staffMemberId } : {}),
        fromDate: startOfDay(new Date(date)).toISOString(),
        toDate: endOfDay(new Date(date)).toISOString(),
      }),
    enabled: !!effectiveLocationId && !!serviceId,
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ContactFormValues>();

  if (created) {
    return (
      <Card className="max-w-md text-center">
        <p className="text-base font-semibold text-text-primary">{t("appointment.createdNotice")}</p>
        <Button className="mt-token-4" onClick={() => router.push(`/${locale}/calendar`)}>
          {t("appointment.backToCalendarButton")}
        </Button>
      </Card>
    );
  }

  const onSubmit = handleSubmit(async (values) => {
    if (!effectiveLocationId || !selectedSlot) {
      return;
    }
    setSubmitError(null);
    setIsSubmitting(true);
    try {
      await createAppointment(session.tenantId, {
        locationId: effectiveLocationId,
        staffMemberId: selectedSlot.staffMemberId,
        serviceId: serviceId!,
        startAt: selectedSlot.startAt,
        contact: {
          phoneE164: values.phoneE164,
          ...(values.displayName ? { displayName: values.displayName } : {}),
        },
      });
      setCreated(true);
    } catch (error) {
      if (error instanceof NetworkError) {
        setSubmitError(t("common.offlineBanner"));
      } else if (error instanceof ApiError) {
        setSubmitError(error.message);
      } else {
        setSubmitError(t("common.errorGeneric"));
      }
    } finally {
      setIsSubmitting(false);
    }
  });

  return (
    <div className="flex flex-col gap-token-6">
      <h1 className="text-xl font-semibold text-text-primary">{t("appointment.newAppointmentTitle")}</h1>

      <AsyncStateView
        isLoading={locationsQuery.isLoading}
        isError={locationsQuery.isError}
        error={locationsQuery.error}
        data={locationsQuery.data}
        isEmpty={(data) => data.length === 0}
        onRetry={() => void locationsQuery.refetch()}
      >
        {(locations) => (
          <Card className="flex max-w-xl flex-col gap-token-4">
            {locations.length > 1 ? (
              <label className="flex flex-col gap-token-1 text-sm">
                <span className="font-medium text-text-primary">{t("operations.locationLabel")}</span>
                <select
                  className="min-h-[2.5rem] rounded-token border border-border bg-surface px-token-3 text-sm"
                  value={effectiveLocationId ?? ""}
                  onChange={(event) => setLocationId(event.target.value)}
                >
                  {locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            <label className="flex flex-col gap-token-1 text-sm">
              <span className="font-medium text-text-primary">{t("appointment.serviceLabel")}</span>
              <select
                className="min-h-[2.5rem] rounded-token border border-border bg-surface px-token-3 text-sm"
                value={serviceId ?? ""}
                onChange={(event) => {
                  setServiceId(event.target.value || null);
                  setSelectedSlot(null);
                }}
              >
                <option value="">—</option>
                {(servicesQuery.data ?? []).map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.nameEn}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-token-1 text-sm">
              <span className="font-medium text-text-primary">{t("appointment.staffLabel")}</span>
              <select
                className="min-h-[2.5rem] rounded-token border border-border bg-surface px-token-3 text-sm"
                value={staffMemberId}
                onChange={(event) => {
                  setStaffMemberId(event.target.value);
                  setSelectedSlot(null);
                }}
              >
                <option value="">—</option>
                {(staffQuery.data ?? []).map((staff) => (
                  <option key={staff.id} value={staff.id}>
                    {staff.displayName}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-token-1 text-sm">
              <span className="font-medium text-text-primary">{t("appointment.dateLabel")}</span>
              <input
                type="date"
                className="min-h-[2.5rem] rounded-token border border-border bg-surface px-token-3 text-sm"
                value={date}
                onChange={(event) => {
                  setDate(event.target.value);
                  setSelectedSlot(null);
                }}
              />
            </label>

            {!serviceId ? (
              <p className="text-sm text-text-secondary">{t("appointment.selectServiceFirst")}</p>
            ) : (
              <AsyncStateView
                isLoading={slotsQuery.isLoading}
                isError={slotsQuery.isError}
                error={slotsQuery.error}
                data={slotsQuery.data}
                isEmpty={(data) => data.length === 0}
                emptyTitle={t("appointment.noOpenSlots")}
                onRetry={() => void slotsQuery.refetch()}
              >
                {(slots) => (
                  <fieldset className="flex flex-col gap-token-2">
                    <legend className="text-sm font-medium text-text-primary">
                      {t("appointment.timeSlotLabel")}
                    </legend>
                    <div className="flex flex-wrap gap-token-2">
                      {slots.map((slot) => {
                        const staffName =
                          (staffQuery.data ?? []).find((s) => s.id === slot.staffMemberId)?.displayName ?? "";
                        const isSelected =
                          selectedSlot?.startAt === slot.startAt &&
                          selectedSlot?.staffMemberId === slot.staffMemberId;
                        return (
                          <Button
                            key={`${slot.staffMemberId}-${slot.startAt}`}
                            type="button"
                            variant={isSelected ? "primary" : "secondary"}
                            onClick={() => setSelectedSlot(slot)}
                          >
                            {new Date(slot.startAt).toLocaleTimeString(locale, {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}{" "}
                            {staffName}
                          </Button>
                        );
                      })}
                    </div>
                  </fieldset>
                )}
              </AsyncStateView>
            )}

            <form className="flex flex-col gap-token-4" onSubmit={onSubmit} noValidate>
              <TextField
                label={t("appointment.contactPhoneLabel")}
                placeholder="+9665XXXXXXXX"
                error={errors.phoneE164 ? t("common.requiredField") : undefined}
                {...register("phoneE164", { required: true })}
              />
              <TextField label={t("appointment.contactNameLabel")} {...register("displayName")} />
              {submitError ? (
                <p role="alert" className="text-sm text-danger">
                  {submitError}
                </p>
              ) : null}
              <Button type="submit" isLoading={isSubmitting} disabled={!selectedSlot}>
                {t("appointment.createButton")}
              </Button>
            </form>
          </Card>
        )}
      </AsyncStateView>
    </div>
  );
}

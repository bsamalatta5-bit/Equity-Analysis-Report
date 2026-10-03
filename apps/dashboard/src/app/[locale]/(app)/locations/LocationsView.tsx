"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useI18n } from "../../../../lib/i18n/provider";
import { useCurrentSession } from "../../../../lib/auth/session-context";
import {
  createLocation,
  createPhoneNumber,
  listLocations,
  listPhoneNumbers,
  updateLocation,
  type LocationSummary,
} from "../../../../lib/locations/api";
import { ApiError, NetworkError } from "../../../../lib/api/client";
import { Card } from "../../../../components/ui/Card";
import { Badge } from "../../../../components/ui/Badge";
import { Button } from "../../../../components/ui/Button";
import { TextField } from "../../../../components/ui/TextField";
import { AsyncStateView } from "../../../../components/states/AsyncStateView";

export function LocationsView() {
  const { t } = useI18n();
  const session = useCurrentSession();
  const queryClient = useQueryClient();
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [managingPhonesId, setManagingPhonesId] = useState<string | null>(null);
  const canCreate = session.role === "tenant_owner";

  const queryKey = ["locations", session.tenantId];
  const locationsQuery = useQuery({ queryKey, queryFn: () => listLocations(session.tenantId) });
  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  return (
    <div className="flex flex-col gap-token-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-text-primary">{t("locationMgmt.title")}</h1>
        {canCreate && !isAdding ? (
          <Button onClick={() => setIsAdding(true)}>{t("locationMgmt.addButton")}</Button>
        ) : null}
      </div>

      {isAdding ? (
        <LocationForm
          title={t("locationMgmt.addTitle")}
          onCancel={() => setIsAdding(false)}
          onSubmit={async (values) => {
            await createLocation(session.tenantId, values);
            await invalidate();
            setIsAdding(false);
          }}
        />
      ) : null}

      <AsyncStateView
        isLoading={locationsQuery.isLoading}
        isError={locationsQuery.isError}
        error={locationsQuery.error}
        data={locationsQuery.data}
        isEmpty={(data) => data.length === 0}
        onRetry={() => void locationsQuery.refetch()}
      >
        {(locations) => (
          <div className="flex flex-col gap-token-3">
            {locations.map((location) =>
              editingId === location.id ? (
                <Card key={location.id}>
                  <LocationForm
                    title={t("locationMgmt.title")}
                    initial={location}
                    onCancel={() => setEditingId(null)}
                    onSubmit={async (values) => {
                      await updateLocation(session.tenantId, location.id, values);
                      await invalidate();
                      setEditingId(null);
                    }}
                  />
                </Card>
              ) : (
                <Card key={location.id}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-text-primary">{location.name}</p>
                      <p className="text-sm text-text-secondary">{location.addressLine}</p>
                      <p className="text-sm text-text-secondary">{location.timezone}</p>
                    </div>
                    <Badge tone={location.active ? "success" : "neutral"}>
                      {location.active ? t("locationMgmt.activeLabel") : "—"}
                    </Badge>
                  </div>
                  <div className="mt-token-3 flex gap-token-2">
                    <Button variant="secondary" onClick={() => setEditingId(location.id)}>
                      {t("services.editButton")}
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() =>
                        setManagingPhonesId(managingPhonesId === location.id ? null : location.id)
                      }
                    >
                      {t("locationMgmt.phoneNumbersTitle")}
                    </Button>
                  </div>
                  {managingPhonesId === location.id ? (
                    <div className="mt-token-4 border-t border-border pt-token-4">
                      <PhoneNumbersSection
                        tenantId={session.tenantId}
                        locationId={location.id}
                        canCreate={canCreate}
                      />
                    </div>
                  ) : null}
                </Card>
              ),
            )}
          </div>
        )}
      </AsyncStateView>
    </div>
  );
}

interface LocationFormValues {
  name: string;
  addressLine: string;
  timezone: string;
  active: boolean;
}

function LocationForm({
  title,
  initial,
  onCancel,
  onSubmit,
}: {
  title: string;
  initial?: LocationSummary;
  onCancel: () => void;
  onSubmit: (values: LocationFormValues) => Promise<void>;
}) {
  const { t } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { register, handleSubmit } = useForm<LocationFormValues>({
    defaultValues: initial ?? { timezone: "Asia/Riyadh", active: true },
  });

  const submit = handleSubmit(async (values) => {
    setError(null);
    setIsSubmitting(true);
    try {
      await onSubmit(values);
    } catch (err) {
      if (err instanceof NetworkError) {
        setError(t("common.offlineBanner"));
      } else if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError(t("common.errorGeneric"));
      }
    } finally {
      setIsSubmitting(false);
    }
  });

  return (
    <Card className="max-w-xl">
      <form className="flex flex-col gap-token-4" onSubmit={submit} noValidate>
        <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
        <TextField label={t("locationMgmt.nameLabel")} {...register("name", { required: true })} />
        <TextField label={t("locationMgmt.addressLabel")} {...register("addressLine", { required: true })} />
        <TextField label={t("locationMgmt.timezoneLabel")} {...register("timezone", { required: true })} />
        <label className="flex items-center gap-token-2 text-sm">
          <input type="checkbox" {...register("active")} />
          <span>{t("locationMgmt.activeLabel")}</span>
        </label>
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
        <div className="flex gap-token-2">
          <Button type="submit" isLoading={isSubmitting}>
            {t("locationMgmt.saveButton")}
          </Button>
          <Button type="button" variant="secondary" onClick={onCancel}>
            {t("common.cancel")}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function PhoneNumbersSection({
  tenantId,
  locationId,
  canCreate,
}: {
  tenantId: string;
  locationId: string;
  canCreate: boolean;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const queryKey = ["phone-numbers", tenantId, locationId];
  const phonesQuery = useQuery({ queryKey, queryFn: () => listPhoneNumbers(tenantId, locationId) });
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { register, handleSubmit, reset } = useForm<{ e164Number: string; providerReference: string }>();

  const submit = handleSubmit(async (values) => {
    setError(null);
    setIsSubmitting(true);
    try {
      await createPhoneNumber(tenantId, { locationId, ...values });
      await queryClient.invalidateQueries({ queryKey });
      reset();
    } catch (err) {
      if (err instanceof NetworkError) {
        setError(t("common.offlineBanner"));
      } else if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError(t("common.errorGeneric"));
      }
    } finally {
      setIsSubmitting(false);
    }
  });

  return (
    <div className="flex flex-col gap-token-4">
      <h3 className="text-sm font-semibold text-text-primary">{t("locationMgmt.phoneNumbersTitle")}</h3>
      <AsyncStateView
        isLoading={phonesQuery.isLoading}
        isError={phonesQuery.isError}
        error={phonesQuery.error}
        data={phonesQuery.data}
        isEmpty={(data) => data.length === 0}
        emptyTitle={t("locationMgmt.noPhoneNumbers")}
        onRetry={() => void phonesQuery.refetch()}
      >
        {(phones) => (
          <ul className="flex flex-col gap-token-1 text-sm">
            {phones.map((phone) => (
              <li key={phone.id} className="flex items-center justify-between">
                <span dir="ltr">{phone.e164Number}</span>
                <Badge tone={phone.status === "active" ? "success" : "neutral"}>{phone.status}</Badge>
              </li>
            ))}
          </ul>
        )}
      </AsyncStateView>
      {canCreate ? (
        <form className="flex flex-wrap items-end gap-token-3" onSubmit={submit} noValidate>
          <TextField
            label={t("onboarding.phoneNumberLabel")}
            placeholder="+9665XXXXXXXX"
            {...register("e164Number", { required: true })}
          />
          <TextField
            label={t("locationMgmt.providerReferenceLabel")}
            {...register("providerReference", { required: true })}
          />
          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}
          <Button type="submit" isLoading={isSubmitting}>
            {t("locationMgmt.addPhoneButton")}
          </Button>
        </form>
      ) : null}
    </div>
  );
}

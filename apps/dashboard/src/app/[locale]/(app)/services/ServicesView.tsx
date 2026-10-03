"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useI18n } from "../../../../lib/i18n/provider";
import { useCurrentSession } from "../../../../lib/auth/session-context";
import { useLocations } from "../../../../lib/locations/use-locations";
import { createService, listServices, updateService, type ServiceSummary } from "../../../../lib/catalog/api";
import { ApiError, NetworkError } from "../../../../lib/api/client";
import { Card } from "../../../../components/ui/Card";
import { Badge } from "../../../../components/ui/Badge";
import { Button } from "../../../../components/ui/Button";
import { TextField } from "../../../../components/ui/TextField";
import { AsyncStateView } from "../../../../components/states/AsyncStateView";

export function ServicesView() {
  const { t } = useI18n();
  const session = useCurrentSession();
  const locationsQuery = useLocations(session.tenantId);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const locationId = selectedLocationId ?? locationsQuery.data?.[0]?.id;

  return (
    <div className="flex flex-col gap-token-6">
      <h1 className="text-xl font-semibold text-text-primary">{t("services.title")}</h1>
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
            {locationId ? <ServiceList tenantId={session.tenantId} locationId={locationId} /> : null}
          </div>
        )}
      </AsyncStateView>
    </div>
  );
}

function ServiceList({ tenantId, locationId }: { tenantId: string; locationId: string }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const queryKey = ["services", tenantId, locationId];
  const servicesQuery = useQuery({ queryKey, queryFn: () => listServices(tenantId, locationId) });
  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  return (
    <div className="flex flex-col gap-token-4">
      {!isAdding ? (
        <div>
          <Button onClick={() => setIsAdding(true)}>{t("services.addButton")}</Button>
        </div>
      ) : (
        <ServiceForm
          title={t("services.addTitle")}
          onCancel={() => setIsAdding(false)}
          onSubmit={async (values) => {
            await createService(tenantId, locationId, values);
            await invalidate();
            setIsAdding(false);
          }}
        />
      )}

      <AsyncStateView
        isLoading={servicesQuery.isLoading}
        isError={servicesQuery.isError}
        error={servicesQuery.error}
        data={servicesQuery.data}
        isEmpty={(data) => data.length === 0}
        emptyTitle={t("services.noServices")}
        onRetry={() => void servicesQuery.refetch()}
      >
        {(services) => (
          <div className="flex flex-col gap-token-3">
            {services.map((service) =>
              editingId === service.id ? (
                <Card key={service.id}>
                  <ServiceForm
                    title={t("services.editButton")}
                    initial={service}
                    onCancel={() => setEditingId(null)}
                    onSubmit={async (values) => {
                      await updateService(tenantId, locationId, service.id, values);
                      await invalidate();
                      setEditingId(null);
                    }}
                  />
                </Card>
              ) : (
                <Card key={service.id}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-text-primary">{service.nameEn}</p>
                      <p className="text-sm text-text-secondary" dir="rtl">
                        {service.nameAr}
                      </p>
                      <p className="text-sm text-text-secondary">
                        {service.durationMinutes} min · {service.statedPrice}
                      </p>
                    </div>
                    <Badge tone={service.active ? "success" : "neutral"}>
                      {service.active ? t("services.activeLabel") : "—"}
                    </Badge>
                  </div>
                  <div className="mt-token-3">
                    <Button variant="secondary" onClick={() => setEditingId(service.id)}>
                      {t("services.editButton")}
                    </Button>
                  </div>
                </Card>
              ),
            )}
          </div>
        )}
      </AsyncStateView>
    </div>
  );
}

interface ServiceFormValues {
  nameAr: string;
  nameEn: string;
  durationMinutes: number;
  statedPrice: number;
  active: boolean;
}

function ServiceForm({
  title,
  initial,
  onCancel,
  onSubmit,
}: {
  title: string;
  initial?: ServiceSummary;
  onCancel: () => void;
  onSubmit: (values: ServiceFormValues) => Promise<void>;
}) {
  const { t } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { register, handleSubmit } = useForm<ServiceFormValues>({
    defaultValues: initial ?? { durationMinutes: 30, statedPrice: 0, active: true },
  });

  const submit = handleSubmit(async (values) => {
    setError(null);
    setIsSubmitting(true);
    try {
      await onSubmit({
        ...values,
        durationMinutes: Number(values.durationMinutes),
        statedPrice: Number(values.statedPrice),
      });
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
        <TextField label={t("services.nameArLabel")} dir="rtl" {...register("nameAr", { required: true })} />
        <TextField label={t("services.nameEnLabel")} {...register("nameEn", { required: true })} />
        <TextField
          label={t("services.durationLabel")}
          type="number"
          min={5}
          max={480}
          {...register("durationMinutes", { required: true, valueAsNumber: true })}
        />
        <TextField
          label={t("services.priceLabel")}
          type="number"
          min={0}
          step="0.01"
          {...register("statedPrice", { required: true, valueAsNumber: true })}
        />
        <label className="flex items-center gap-token-2 text-sm">
          <input type="checkbox" {...register("active")} />
          <span>{t("services.activeLabel")}</span>
        </label>
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
        <div className="flex gap-token-2">
          <Button type="submit" isLoading={isSubmitting}>
            {t("services.saveButton")}
          </Button>
          <Button type="button" variant="secondary" onClick={onCancel}>
            {t("common.cancel")}
          </Button>
        </div>
      </form>
    </Card>
  );
}

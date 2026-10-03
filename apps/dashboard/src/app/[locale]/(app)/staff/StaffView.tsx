"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useI18n } from "../../../../lib/i18n/provider";
import type { MessagePath } from "../../../../lib/i18n/message-path";
import { useCurrentSession } from "../../../../lib/auth/session-context";
import { useLocations } from "../../../../lib/locations/use-locations";
import { createStaffMember, listStaff } from "../../../../lib/catalog/api";
import {
  createAvailabilityRule,
  listAvailabilityRules,
  type CreateAvailabilityRuleInput,
} from "../../../../lib/availability/api";
import { ApiError, NetworkError } from "../../../../lib/api/client";
import { Card } from "../../../../components/ui/Card";
import { Badge } from "../../../../components/ui/Badge";
import { Button } from "../../../../components/ui/Button";
import { TextField } from "../../../../components/ui/TextField";
import { AsyncStateView } from "../../../../components/states/AsyncStateView";

const WEEKDAY_KEYS: readonly MessagePath[] = [
  "staff.weekdaySunday",
  "staff.weekdayMonday",
  "staff.weekdayTuesday",
  "staff.weekdayWednesday",
  "staff.weekdayThursday",
  "staff.weekdayFriday",
  "staff.weekdaySaturday",
];

export function StaffView() {
  const { t } = useI18n();
  const session = useCurrentSession();
  const locationsQuery = useLocations(session.tenantId);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const locationId = selectedLocationId ?? locationsQuery.data?.[0]?.id;

  return (
    <div className="flex flex-col gap-token-6">
      <h1 className="text-xl font-semibold text-text-primary">{t("staff.title")}</h1>
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
            {locationId ? <StaffList tenantId={session.tenantId} locationId={locationId} /> : null}
          </div>
        )}
      </AsyncStateView>
    </div>
  );
}

function StaffList({ tenantId, locationId }: { tenantId: string; locationId: string }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [isAdding, setIsAdding] = useState(false);
  const [managingId, setManagingId] = useState<string | null>(null);

  const queryKey = ["staff", tenantId, locationId];
  const staffQuery = useQuery({ queryKey, queryFn: () => listStaff(tenantId, locationId) });
  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  const { register, handleSubmit, reset } = useForm<{ displayName: string }>();
  const [addError, setAddError] = useState<string | null>(null);
  const [isSubmittingAdd, setIsSubmittingAdd] = useState(false);

  const submitAdd = handleSubmit(async (values) => {
    setAddError(null);
    setIsSubmittingAdd(true);
    try {
      await createStaffMember(tenantId, locationId, { ...values, active: true });
      await invalidate();
      reset();
      setIsAdding(false);
    } catch (err) {
      if (err instanceof NetworkError) {
        setAddError(t("common.offlineBanner"));
      } else if (err instanceof ApiError) {
        setAddError(err.message);
      } else {
        setAddError(t("common.errorGeneric"));
      }
    } finally {
      setIsSubmittingAdd(false);
    }
  });

  return (
    <div className="flex flex-col gap-token-4">
      {!isAdding ? (
        <div>
          <Button onClick={() => setIsAdding(true)}>{t("staff.addButton")}</Button>
        </div>
      ) : (
        <Card className="max-w-xl">
          <form className="flex flex-col gap-token-4" onSubmit={submitAdd} noValidate>
            <h2 className="text-sm font-semibold text-text-primary">{t("staff.addTitle")}</h2>
            <TextField label={t("staff.nameLabel")} {...register("displayName", { required: true })} />
            {addError ? (
              <p role="alert" className="text-sm text-danger">
                {addError}
              </p>
            ) : null}
            <div className="flex gap-token-2">
              <Button type="submit" isLoading={isSubmittingAdd}>
                {t("staff.saveButton")}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setIsAdding(false)}>
                {t("common.cancel")}
              </Button>
            </div>
          </form>
        </Card>
      )}

      <AsyncStateView
        isLoading={staffQuery.isLoading}
        isError={staffQuery.isError}
        error={staffQuery.error}
        data={staffQuery.data}
        isEmpty={(data) => data.length === 0}
        emptyTitle={t("staff.noStaff")}
        onRetry={() => void staffQuery.refetch()}
      >
        {(staffMembers) => (
          <div className="flex flex-col gap-token-3">
            {staffMembers.map((staffMember) => (
              <Card key={staffMember.id}>
                <div className="flex items-center justify-between">
                  <p className="font-medium text-text-primary">{staffMember.displayName}</p>
                  <Badge tone={staffMember.active ? "success" : "neutral"}>
                    {staffMember.active ? t("staff.activeLabel") : "—"}
                  </Badge>
                </div>
                <div className="mt-token-3">
                  <Button
                    variant="secondary"
                    onClick={() => setManagingId(managingId === staffMember.id ? null : staffMember.id)}
                  >
                    {t("staff.manageButton")}
                  </Button>
                </div>
                {managingId === staffMember.id ? (
                  <div className="mt-token-4 border-t border-border pt-token-4">
                    <AvailabilitySection
                      tenantId={tenantId}
                      locationId={locationId}
                      staffMemberId={staffMember.id}
                    />
                  </div>
                ) : null}
              </Card>
            ))}
          </div>
        )}
      </AsyncStateView>
    </div>
  );
}

function AvailabilitySection({
  tenantId,
  locationId,
  staffMemberId,
}: {
  tenantId: string;
  locationId: string;
  staffMemberId: string;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const queryKey = ["availability-rules", tenantId, locationId, staffMemberId];
  const rulesQuery = useQuery({
    queryKey,
    queryFn: () => listAvailabilityRules(tenantId, locationId, staffMemberId),
  });

  const { register, handleSubmit, reset } = useForm<CreateAvailabilityRuleInput>({
    defaultValues: {
      weekday: 0,
      startTime: "09:00",
      endTime: "17:00",
      effectiveFrom: new Date().toISOString().slice(0, 10),
    },
  });
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = handleSubmit(async (values) => {
    setError(null);
    setIsSubmitting(true);
    try {
      await createAvailabilityRule(tenantId, locationId, staffMemberId, {
        ...values,
        weekday: Number(values.weekday),
      });
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
      <h3 className="text-sm font-semibold text-text-primary">{t("staff.availabilityTitle")}</h3>
      <AsyncStateView
        isLoading={rulesQuery.isLoading}
        isError={rulesQuery.isError}
        error={rulesQuery.error}
        data={rulesQuery.data}
        isEmpty={(data) => data.length === 0}
        emptyTitle={t("staff.noRules")}
        onRetry={() => void rulesQuery.refetch()}
      >
        {(rules) => (
          <ul className="flex flex-col gap-token-1 text-sm">
            {rules.map((rule) => (
              <li key={rule.id}>
                {t(WEEKDAY_KEYS[rule.weekday]!)} {rule.startTime}–{rule.endTime}
              </li>
            ))}
          </ul>
        )}
      </AsyncStateView>

      <form className="flex flex-wrap items-end gap-token-3" onSubmit={submit} noValidate>
        <label className="flex flex-col gap-token-1 text-sm">
          <span className="font-medium text-text-primary">{t("staff.weekdayLabel")}</span>
          <select
            className="min-h-[2.5rem] rounded-token border border-border bg-surface px-token-2 text-sm"
            {...register("weekday", { valueAsNumber: true })}
          >
            {WEEKDAY_KEYS.map((key, index) => (
              <option key={key} value={index}>
                {t(key)}
              </option>
            ))}
          </select>
        </label>
        <TextField
          label={t("staff.startTimeLabel")}
          type="time"
          {...register("startTime", { required: true })}
        />
        <TextField label={t("staff.endTimeLabel")} type="time" {...register("endTime", { required: true })} />
        <input type="hidden" {...register("effectiveFrom")} />
        <Button type="submit" isLoading={isSubmitting}>
          {t("staff.addRuleButton")}
        </Button>
      </form>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

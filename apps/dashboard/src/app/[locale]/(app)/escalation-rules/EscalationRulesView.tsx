"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { EscalationTriggerType } from "@voice-receptionist/shared";
import { useI18n } from "../../../../lib/i18n/provider";
import type { MessagePath } from "../../../../lib/i18n/message-path";
import { useCurrentSession } from "../../../../lib/auth/session-context";
import { useLocations } from "../../../../lib/locations/use-locations";
import {
  createEscalationRule,
  deleteEscalationRule,
  listEscalationRules,
} from "../../../../lib/escalation/api";
import { ApiError, NetworkError } from "../../../../lib/api/client";
import { Card } from "../../../../components/ui/Card";
import { Button } from "../../../../components/ui/Button";
import { TextField } from "../../../../components/ui/TextField";
import { AsyncStateView } from "../../../../components/states/AsyncStateView";

const TRIGGER_LABEL_KEYS: Record<EscalationTriggerType, MessagePath> = {
  explicit_request: "escalation.triggerExplicitRequest",
  low_confidence: "escalation.triggerLowConfidence",
  emergency: "escalation.triggerEmergency",
  provider_failure: "escalation.triggerProviderFailure",
  silence_timeout: "escalation.triggerSilenceTimeout",
};

export function EscalationRulesView() {
  const { t } = useI18n();
  const session = useCurrentSession();
  const locationsQuery = useLocations(session.tenantId);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const locationId = selectedLocationId ?? locationsQuery.data?.[0]?.id;

  return (
    <div className="flex flex-col gap-token-6">
      <h1 className="text-xl font-semibold text-text-primary">{t("escalation.title")}</h1>
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
              <RuleList tenantId={session.tenantId} locationId={locationId} role={session.role} />
            ) : null}
          </div>
        )}
      </AsyncStateView>
    </div>
  );
}

interface RuleFormValues {
  triggerType: EscalationTriggerType;
  targetPhoneE164: string;
  weekday: number;
  startTime: string;
  endTime: string;
}

function RuleList({ tenantId, locationId, role }: { tenantId: string; locationId: string; role: string }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [isAdding, setIsAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const queryKey = ["escalation-rules", tenantId, locationId];
  const rulesQuery = useQuery({ queryKey, queryFn: () => listEscalationRules(tenantId, locationId) });
  const invalidate = () => queryClient.invalidateQueries({ queryKey });
  const canDelete = role === "tenant_owner";

  const { register, handleSubmit, reset } = useForm<RuleFormValues>({
    defaultValues: { triggerType: "explicit_request", weekday: 0, startTime: "00:00", endTime: "23:59" },
  });

  const submit = handleSubmit(async (values) => {
    setError(null);
    setIsSubmitting(true);
    try {
      await createEscalationRule(tenantId, locationId, {
        triggerType: values.triggerType,
        targetPhoneE164: values.targetPhoneE164,
        activeHours: {
          windows: [
            { weekday: Number(values.weekday), startTime: values.startTime, endTime: values.endTime },
          ],
        },
      });
      await invalidate();
      reset();
      setIsAdding(false);
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
      {!isAdding ? (
        <div>
          <Button onClick={() => setIsAdding(true)}>{t("escalation.addButton")}</Button>
        </div>
      ) : (
        <Card className="max-w-xl">
          <form className="flex flex-col gap-token-4" onSubmit={submit} noValidate>
            <h2 className="text-sm font-semibold text-text-primary">{t("escalation.addTitle")}</h2>
            <label className="flex flex-col gap-token-1 text-sm">
              <span className="font-medium text-text-primary">{t("escalation.triggerTypeLabel")}</span>
              <select
                className="min-h-[2.5rem] rounded-token border border-border bg-surface px-token-3 text-sm"
                {...register("triggerType")}
              >
                {Object.entries(TRIGGER_LABEL_KEYS).map(([value, key]) => (
                  <option key={value} value={value}>
                    {t(key)}
                  </option>
                ))}
              </select>
            </label>
            <TextField
              label={t("escalation.targetPhoneLabel")}
              placeholder="+9665XXXXXXXX"
              {...register("targetPhoneE164", { required: true })}
            />
            <div className="flex flex-wrap gap-token-3">
              <TextField
                label={t("escalation.startTimeLabel")}
                type="time"
                {...register("startTime", { required: true })}
              />
              <TextField
                label={t("escalation.endTimeLabel")}
                type="time"
                {...register("endTime", { required: true })}
              />
            </div>
            {error ? (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            ) : null}
            <div className="flex gap-token-2">
              <Button type="submit" isLoading={isSubmitting}>
                {t("common.save")}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setIsAdding(false)}>
                {t("common.cancel")}
              </Button>
            </div>
          </form>
        </Card>
      )}

      <AsyncStateView
        isLoading={rulesQuery.isLoading}
        isError={rulesQuery.isError}
        error={rulesQuery.error}
        data={rulesQuery.data}
        isEmpty={(data) => data.length === 0}
        emptyTitle={t("escalation.noRules")}
        onRetry={() => void rulesQuery.refetch()}
      >
        {(rules) => (
          <div className="flex flex-col gap-token-3">
            {rules.map((rule) => (
              <Card key={rule.id} className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-text-primary">{t(TRIGGER_LABEL_KEYS[rule.triggerType])}</p>
                  <p className="text-sm text-text-secondary" dir="ltr">
                    {rule.targetPhoneE164}
                  </p>
                </div>
                {canDelete ? (
                  <Button
                    variant="danger"
                    onClick={async () => {
                      await deleteEscalationRule(tenantId, locationId, rule.id);
                      await invalidate();
                    }}
                  >
                    {t("escalation.deleteButton")}
                  </Button>
                ) : null}
              </Card>
            ))}
          </div>
        )}
      </AsyncStateView>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { TenantStatus } from "@voice-receptionist/shared";
import { useI18n } from "../../../../lib/i18n/provider";
import { ROLE_LABEL_KEYS } from "../../../../lib/format/role-labels";
import { useCurrentSession } from "../../../../lib/auth/session-context";
import { changePassword } from "../../../../lib/auth/api";
import { getTenant, updateTenant } from "../../../../lib/tenant/api";
import { ApiError, NetworkError } from "../../../../lib/api/client";
import { Card } from "../../../../components/ui/Card";
import { Button } from "../../../../components/ui/Button";
import { TextField } from "../../../../components/ui/TextField";
import { AsyncStateView } from "../../../../components/states/AsyncStateView";

const TENANT_STATUSES: readonly TenantStatus[] = ["active", "suspended", "offboarded"];

export function SettingsView() {
  const { t } = useI18n();
  const session = useCurrentSession();

  return (
    <div className="flex flex-col gap-token-6">
      <h1 className="text-xl font-semibold text-text-primary">{t("settings.title")}</h1>

      <Card className="max-w-xl">
        <p className="text-sm text-text-secondary">
          {t("settings.roleLabel")}: <span className="font-medium text-text-primary">{t(ROLE_LABEL_KEYS[session.role])}</span>
        </p>
      </Card>

      <ChangePasswordForm />

      {session.role === "tenant_owner" ? <TenantDetailsForm tenantId={session.tenantId} /> : null}
    </div>
  );
}

interface ChangePasswordValues {
  currentPassword: string;
  newPassword: string;
}

function ChangePasswordForm() {
  const { t } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { register, handleSubmit, reset } = useForm<ChangePasswordValues>();

  const submit = handleSubmit(async (values) => {
    setError(null);
    setSuccess(false);
    setIsSubmitting(true);
    try {
      await changePassword(values.currentPassword, values.newPassword);
      reset();
      setSuccess(true);
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
        <h2 className="text-sm font-semibold text-text-primary">{t("settings.changePasswordTitle")}</h2>
        <TextField
          label={t("settings.currentPasswordLabel")}
          type="password"
          autoComplete="current-password"
          {...register("currentPassword", { required: true })}
        />
        <TextField
          label={t("settings.newPasswordLabel")}
          type="password"
          autoComplete="new-password"
          {...register("newPassword", { required: true, minLength: 12 })}
        />
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
        {success ? (
          <p role="status" className="text-sm text-success">
            {t("settings.changePasswordSuccess")}
          </p>
        ) : null}
        <div>
          <Button type="submit" isLoading={isSubmitting}>
            {t("settings.changePasswordButton")}
          </Button>
        </div>
      </form>
    </Card>
  );
}

interface TenantDetailsValues {
  legalName: string;
  status: TenantStatus;
}

function TenantDetailsForm({ tenantId }: { tenantId: string }) {
  const queryKey = ["tenant", tenantId];
  const tenantQuery = useQuery({ queryKey, queryFn: () => getTenant(tenantId) });

  return (
    <Card className="max-w-xl">
      <AsyncStateView
        isLoading={tenantQuery.isLoading}
        isError={tenantQuery.isError}
        error={tenantQuery.error}
        data={tenantQuery.data}
        isEmpty={() => false}
        onRetry={() => void tenantQuery.refetch()}
      >
        {(tenant) => (
          <TenantDetailsEditForm
            tenantId={tenantId}
            initial={{ legalName: tenant.legalName, status: tenant.status }}
          />
        )}
      </AsyncStateView>
    </Card>
  );
}

function TenantDetailsEditForm({
  tenantId,
  initial,
}: {
  tenantId: string;
  initial: TenantDetailsValues;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { register, handleSubmit } = useForm<TenantDetailsValues>({ defaultValues: initial });

  const submit = handleSubmit(async (values) => {
    setError(null);
    setSuccess(false);
    setIsSubmitting(true);
    try {
      await updateTenant(tenantId, values);
      await queryClient.invalidateQueries({ queryKey: ["tenant", tenantId] });
      setSuccess(true);
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
    <form className="flex flex-col gap-token-4" onSubmit={submit} noValidate>
      <h2 className="text-sm font-semibold text-text-primary">{t("settings.tenantDetailsTitle")}</h2>
      <TextField label={t("settings.legalNameLabel")} {...register("legalName", { required: true })} />
      <label className="flex flex-col gap-token-1 text-sm">
        <span className="font-medium text-text-primary">{t("settings.tenantStatusLabel")}</span>
        <select
          className="min-h-[2.5rem] rounded-token border border-border bg-surface px-token-3 text-sm"
          {...register("status")}
        >
          {TENANT_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </label>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      {success ? (
        <p role="status" className="text-sm text-success">
          {t("settings.saveSuccess")}
        </p>
      ) : null}
      <div>
        <Button type="submit" isLoading={isSubmitting}>
          {t("settings.saveButton")}
        </Button>
      </div>
    </form>
  );
}

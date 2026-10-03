"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { UserRole, UserStatus } from "@voice-receptionist/shared";
import { useI18n } from "../../../../lib/i18n/provider";
import type { MessagePath } from "../../../../lib/i18n/message-path";
import { ROLE_LABEL_KEYS } from "../../../../lib/format/role-labels";
import { useCurrentSession } from "../../../../lib/auth/session-context";
import { useLocations } from "../../../../lib/locations/use-locations";
import {
  createTenantUser,
  disableTenantUser,
  getTenantUser,
  listTenantUsers,
  updateTenantUser,
  type CreateTenantUserResult,
  type TenantUserDetail,
} from "../../../../lib/tenant-users/api";
import { ApiError, NetworkError } from "../../../../lib/api/client";
import { Card } from "../../../../components/ui/Card";
import { Badge } from "../../../../components/ui/Badge";
import { Button } from "../../../../components/ui/Button";
import { TextField } from "../../../../components/ui/TextField";
import { AsyncStateView } from "../../../../components/states/AsyncStateView";

const STATUS_LABEL_KEYS: Record<UserStatus, MessagePath> = {
  active: "users.statusActive",
  disabled: "users.statusDisabled",
  pending_totp_enrollment: "users.statusPendingTotpEnrollment",
};

const ASSIGNABLE_ROLES: readonly UserRole[] = ["tenant_owner", "location_manager", "front_desk_user"];

export function UsersView() {
  const { t } = useI18n();
  const session = useCurrentSession();
  const queryClient = useQueryClient();
  const locationsQuery = useLocations(session.tenantId);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [createdResult, setCreatedResult] = useState<CreateTenantUserResult | null>(null);
  const canManage = session.role === "tenant_owner";

  const queryKey = ["tenant-users", session.tenantId];
  const usersQuery = useQuery({ queryKey, queryFn: () => listTenantUsers(session.tenantId) });
  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  return (
    <div className="flex flex-col gap-token-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-text-primary">{t("users.title")}</h1>
        {canManage && !isAdding ? (
          <Button onClick={() => setIsAdding(true)}>{t("users.addButton")}</Button>
        ) : null}
      </div>

      {createdResult ? (
        <Card className="max-w-xl border-brand-600">
          <p className="text-sm text-text-primary">{t("users.temporaryPasswordNotice")}</p>
          <p className="mt-token-2 text-sm font-medium text-text-secondary">
            {t("users.temporaryPasswordLabel")}
          </p>
          <p className="select-all font-mono text-sm text-text-primary" dir="ltr">
            {createdResult.temporaryPassword}
          </p>
          <div className="mt-token-3">
            <Button variant="secondary" onClick={() => setCreatedResult(null)}>
              {t("common.close")}
            </Button>
          </div>
        </Card>
      ) : null}

      {isAdding ? (
        <AsyncStateView
          isLoading={locationsQuery.isLoading}
          isError={locationsQuery.isError}
          error={locationsQuery.error}
          data={locationsQuery.data}
          isEmpty={(data) => data.length === 0}
          onRetry={() => void locationsQuery.refetch()}
        >
          {(locations) => (
            <UserForm
              title={t("users.addTitle")}
              locations={locations}
              onCancel={() => setIsAdding(false)}
              onSubmit={async (values) => {
                const result = await createTenantUser(session.tenantId, values);
                await invalidate();
                setCreatedResult(result);
                setIsAdding(false);
              }}
            />
          )}
        </AsyncStateView>
      ) : null}

      <AsyncStateView
        isLoading={usersQuery.isLoading}
        isError={usersQuery.isError}
        error={usersQuery.error}
        data={usersQuery.data}
        isEmpty={(data) => data.length === 0}
        emptyTitle={t("users.noUsers")}
        onRetry={() => void usersQuery.refetch()}
      >
        {(users) => (
          <div className="flex flex-col gap-token-3">
            {users.map((user) =>
              editingId === user.id ? (
                <EditUserCard
                  key={user.id}
                  tenantId={session.tenantId}
                  userId={user.id}
                  onCancel={() => setEditingId(null)}
                  onSaved={async () => {
                    await invalidate();
                    setEditingId(null);
                  }}
                />
              ) : (
                <Card key={user.id} className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-text-primary">{user.email}</p>
                    <p className="text-sm text-text-secondary">{t(ROLE_LABEL_KEYS[user.role])}</p>
                  </div>
                  <div className="flex items-center gap-token-3">
                    <Badge tone={user.status === "active" ? "success" : "neutral"}>
                      {t(STATUS_LABEL_KEYS[user.status])}
                    </Badge>
                    {canManage ? (
                      <div className="flex gap-token-2">
                        <Button variant="secondary" onClick={() => setEditingId(user.id)}>
                          {t("users.editButton")}
                        </Button>
                        {user.status !== "disabled" ? (
                          <Button
                            variant="danger"
                            onClick={async () => {
                              await disableTenantUser(session.tenantId, user.id);
                              await invalidate();
                            }}
                          >
                            {t("users.disableButton")}
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
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

function EditUserCard({
  tenantId,
  userId,
  onCancel,
  onSaved,
}: {
  tenantId: string;
  userId: string;
  onCancel: () => void;
  onSaved: () => Promise<void>;
}) {
  const locationsQuery = useLocations(tenantId);
  const userQuery = useQuery({
    queryKey: ["tenant-user", tenantId, userId],
    queryFn: () => getTenantUser(tenantId, userId),
  });

  return (
    <Card>
      <AsyncStateView
        isLoading={locationsQuery.isLoading || userQuery.isLoading}
        isError={locationsQuery.isError || userQuery.isError}
        error={locationsQuery.error ?? userQuery.error}
        data={
          locationsQuery.data && userQuery.data
            ? { locations: locationsQuery.data, user: userQuery.data }
            : undefined
        }
        isEmpty={() => false}
        onRetry={() => {
          void locationsQuery.refetch();
          void userQuery.refetch();
        }}
      >
        {({ locations, user }) => (
          <UserForm
            title={user.email}
            locations={locations}
            initial={user}
            onCancel={onCancel}
            onSubmit={async (values) => {
              await updateTenantUser(tenantId, user.id, {
                role: values.role,
                locationIds: values.locationIds,
              });
              await onSaved();
            }}
          />
        )}
      </AsyncStateView>
    </Card>
  );
}

interface LocationOption {
  readonly id: string;
  readonly name: string;
}

interface UserFormValues {
  email: string;
  role: UserRole;
  locationIds: string[];
}

function UserForm({
  title,
  locations,
  initial,
  onCancel,
  onSubmit,
}: {
  title: string;
  locations: readonly LocationOption[];
  initial?: TenantUserDetail;
  onCancel: () => void;
  onSubmit: (values: UserFormValues) => Promise<void>;
}) {
  const { t } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { register, handleSubmit } = useForm<UserFormValues>({
    defaultValues: {
      email: initial?.email ?? "",
      role: initial?.role ?? "front_desk_user",
      locationIds: initial ? [...initial.locationIds] : [],
    },
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
        {!initial ? (
          <TextField label={t("users.emailLabel")} type="email" {...register("email", { required: true })} />
        ) : null}
        <label className="flex flex-col gap-token-1 text-sm">
          <span className="font-medium text-text-primary">{t("users.roleLabel")}</span>
          <select
            className="min-h-[2.5rem] rounded-token border border-border bg-surface px-token-3 text-sm"
            {...register("role")}
          >
            {ASSIGNABLE_ROLES.map((role) => (
              <option key={role} value={role}>
                {t(ROLE_LABEL_KEYS[role])}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="flex flex-col gap-token-1 text-sm">
          <legend className="font-medium text-text-primary">{t("users.locationsLabel")}</legend>
          {locations.map((location) => (
            <label key={location.id} className="flex items-center gap-token-2">
              <input type="checkbox" value={location.id} {...register("locationIds")} />
              <span>{location.name}</span>
            </label>
          ))}
        </fieldset>
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
        <div className="flex gap-token-2">
          <Button type="submit" isLoading={isSubmitting}>
            {t("users.saveButton")}
          </Button>
          <Button type="button" variant="secondary" onClick={onCancel}>
            {t("common.cancel")}
          </Button>
        </div>
      </form>
    </Card>
  );
}

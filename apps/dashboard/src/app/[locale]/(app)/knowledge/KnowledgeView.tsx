"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { KnowledgeLanguage } from "@voice-receptionist/shared";
import { useI18n } from "../../../../lib/i18n/provider";
import { useCurrentSession } from "../../../../lib/auth/session-context";
import {
  createKnowledgeItem,
  deleteKnowledgeItem,
  listKnowledgeItems,
  updateKnowledgeItem,
  type KnowledgeItem,
} from "../../../../lib/knowledge/api";
import { ApiError, NetworkError } from "../../../../lib/api/client";
import { Card } from "../../../../components/ui/Card";
import { Badge } from "../../../../components/ui/Badge";
import { Button } from "../../../../components/ui/Button";
import { TextField } from "../../../../components/ui/TextField";
import { AsyncStateView } from "../../../../components/states/AsyncStateView";

export function KnowledgeView() {
  const { t } = useI18n();
  const session = useCurrentSession();
  const queryClient = useQueryClient();
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const queryKey = ["knowledge", session.tenantId];
  const itemsQuery = useQuery({ queryKey, queryFn: () => listKnowledgeItems(session.tenantId) });

  const invalidate = () => queryClient.invalidateQueries({ queryKey });
  const canDelete = session.role === "tenant_owner";

  return (
    <div className="flex flex-col gap-token-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-text-primary">{t("knowledge.title")}</h1>
        {!isAdding ? <Button onClick={() => setIsAdding(true)}>{t("knowledge.addButton")}</Button> : null}
      </div>

      {isAdding ? (
        <KnowledgeForm
          title={t("knowledge.addTitle")}
          onCancel={() => setIsAdding(false)}
          onSubmit={async (values) => {
            await createKnowledgeItem(session.tenantId, values);
            await invalidate();
            setIsAdding(false);
          }}
        />
      ) : null}

      <AsyncStateView
        isLoading={itemsQuery.isLoading}
        isError={itemsQuery.isError}
        error={itemsQuery.error}
        data={itemsQuery.data}
        isEmpty={(data) => data.length === 0}
        emptyTitle={t("knowledge.noItems")}
        onRetry={() => void itemsQuery.refetch()}
      >
        {(items) => (
          <div className="flex flex-col gap-token-3">
            {items.map((item) =>
              editingId === item.id ? (
                <Card key={item.id}>
                  <KnowledgeForm
                    title={t("knowledge.editButton")}
                    initial={item}
                    onCancel={() => setEditingId(null)}
                    onSubmit={async (values) => {
                      await updateKnowledgeItem(session.tenantId, item.id, values);
                      await invalidate();
                      setEditingId(null);
                    }}
                  />
                </Card>
              ) : (
                <Card key={item.id}>
                  <div className="flex items-start justify-between gap-token-3">
                    <div>
                      <p className="font-medium text-text-primary">{item.questionText}</p>
                      <p className="mt-token-1 text-sm text-text-secondary">{item.answerText}</p>
                    </div>
                    <Badge tone={item.active ? "success" : "neutral"}>
                      {item.active ? t("knowledge.activeLabel") : "—"}
                    </Badge>
                  </div>
                  <div className="mt-token-3 flex gap-token-2">
                    <Button variant="secondary" onClick={() => setEditingId(item.id)}>
                      {t("knowledge.editButton")}
                    </Button>
                    {canDelete ? (
                      <Button
                        variant="danger"
                        onClick={async () => {
                          await deleteKnowledgeItem(session.tenantId, item.id);
                          await invalidate();
                        }}
                      >
                        {t("knowledge.deleteButton")}
                      </Button>
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

interface KnowledgeFormValues {
  questionText: string;
  answerText: string;
  language: KnowledgeLanguage;
  active: boolean;
}

function KnowledgeForm({
  title,
  initial,
  onCancel,
  onSubmit,
}: {
  title: string;
  initial?: KnowledgeItem;
  onCancel: () => void;
  onSubmit: (values: KnowledgeFormValues) => Promise<void>;
}) {
  const { t } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { register, handleSubmit } = useForm<KnowledgeFormValues>({
    defaultValues: initial
      ? {
          questionText: initial.questionText,
          answerText: initial.answerText,
          language: initial.language,
          active: initial.active,
        }
      : { language: "en", active: true },
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
        <TextField label={t("knowledge.questionLabel")} {...register("questionText", { required: true })} />
        <label className="flex flex-col gap-token-1 text-sm">
          <span className="font-medium text-text-primary">{t("knowledge.answerLabel")}</span>
          <textarea
            className="min-h-[6rem] rounded-token border border-border bg-surface px-token-3 py-token-2 text-sm"
            {...register("answerText", { required: true })}
          />
        </label>
        <label className="flex flex-col gap-token-1 text-sm">
          <span className="font-medium text-text-primary">{t("knowledge.languageLabel")}</span>
          <select
            className="min-h-[2.5rem] max-w-xs rounded-token border border-border bg-surface px-token-3 text-sm"
            {...register("language")}
          >
            <option value="en">English</option>
            <option value="ar">العربية</option>
          </select>
        </label>
        <label className="flex items-center gap-token-2 text-sm">
          <input type="checkbox" {...register("active")} />
          <span>{t("knowledge.activeLabel")}</span>
        </label>
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
        <div className="flex gap-token-2">
          <Button type="submit" isLoading={isSubmitting}>
            {t("knowledge.saveButton")}
          </Button>
          <Button type="button" variant="secondary" onClick={onCancel}>
            {t("common.cancel")}
          </Button>
        </div>
      </form>
    </Card>
  );
}

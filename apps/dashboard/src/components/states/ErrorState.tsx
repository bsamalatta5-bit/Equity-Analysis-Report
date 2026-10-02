"use client";

import { useI18n } from "../../lib/i18n/provider";
import { Button } from "../ui/Button";

export function ErrorState({
  message,
  onRetry,
}: {
  message?: string | undefined;
  onRetry?: (() => void) | undefined;
}) {
  const { t } = useI18n();
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-token-3 rounded-token border border-danger bg-danger-surface p-token-6 text-center"
    >
      <p className="text-sm font-medium text-danger">{message ?? t("common.errorGeneric")}</p>
      {onRetry ? (
        <Button variant="secondary" onClick={onRetry}>
          {t("common.retry")}
        </Button>
      ) : null}
    </div>
  );
}

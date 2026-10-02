"use client";

import { useI18n } from "../../lib/i18n/provider";

export function LoadingState({ label }: { label?: string | undefined }) {
  const { t } = useI18n();
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-token-2 p-token-8 text-text-secondary"
    >
      <span
        aria-hidden="true"
        className="h-5 w-5 animate-spin rounded-full border-2 border-border border-t-brand-500"
      />
      <span>{label ?? t("common.loading")}</span>
    </div>
  );
}

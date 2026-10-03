"use client";

import type { ReactNode } from "react";
import { useI18n } from "../../lib/i18n/provider";

export function EmptyState({
  title,
  description,
  action,
}: {
  title?: string | undefined;
  description?: string | undefined;
  action?: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center gap-token-2 p-token-8 text-center text-text-secondary">
      <p className="text-base font-semibold text-text-primary">{title ?? t("common.emptyGeneric")}</p>
      {description ? <p className="max-w-prose text-sm">{description}</p> : null}
      {action}
    </div>
  );
}

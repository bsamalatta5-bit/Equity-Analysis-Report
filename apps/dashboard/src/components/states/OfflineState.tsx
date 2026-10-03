"use client";

import { useI18n } from "../../lib/i18n/provider";

export function OfflineState() {
  const { t } = useI18n();
  return (
    <div
      role="status"
      className="flex flex-col items-center gap-token-2 rounded-token border border-warning bg-warning-surface p-token-6 text-center text-sm text-warning"
    >
      <p>{t("common.offlineBanner")}</p>
    </div>
  );
}

/** A persistent, app-shell-level banner, distinct from a per-screen OfflineState. */
export function OfflineBanner() {
  const { t } = useI18n();
  return (
    <div
      role="status"
      className="w-full bg-warning-surface px-token-4 py-token-2 text-center text-sm text-warning"
    >
      {t("common.offlineBanner")}
    </div>
  );
}

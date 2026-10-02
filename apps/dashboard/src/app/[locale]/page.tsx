"use client";

import { useI18n } from "../../lib/i18n/provider";

export default function LocaleHomePage() {
  const { t } = useI18n();
  return (
    <main id="main-content" className="flex min-h-screen items-center justify-center p-token-8">
      <h1 className="text-xl font-semibold text-text-primary">{t("common.appName")}</h1>
    </main>
  );
}

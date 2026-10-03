"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { ar } from "./messages/ar";
import { en } from "./messages/en";
import type { MessagePath } from "./message-path";
import { resolveMessage } from "./message-path";
import { dirFor, type Locale } from "./locales";

const CATALOGS = { en, ar };

interface I18nContextValue {
  locale: Locale;
  dir: "rtl" | "ltr";
  t: (path: MessagePath) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  const value = useMemo<I18nContextValue>(() => {
    const catalog = CATALOGS[locale];
    return {
      locale,
      dir: dirFor(locale),
      t: (path: MessagePath) => resolveMessage(catalog, path),
    };
  }, [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const value = useContext(I18nContext);
  if (!value) {
    throw new Error("useI18n must be used within an I18nProvider.");
  }
  return value;
}

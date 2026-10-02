import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { I18nProvider } from "../../lib/i18n/provider";
import { isLocale, LOCALES, dirFor, type Locale } from "../../lib/i18n/locales";
import { QueryProvider } from "../../lib/query-provider";
import "../../styles/globals.css";

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  if (!isLocale(rawLocale)) {
    notFound();
  }
  const locale: Locale = rawLocale;

  return (
    <html lang={locale} dir={dirFor(locale)}>
      <body>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:start-token-4 focus:top-token-4 focus:z-50 focus:rounded-token focus:bg-brand-600 focus:px-token-4 focus:py-token-2 focus:text-white"
        >
          {locale === "ar" ? "تخطَّ إلى المحتوى" : "Skip to content"}
        </a>
        <I18nProvider locale={locale}>
          <QueryProvider>{children}</QueryProvider>
        </I18nProvider>
      </body>
    </html>
  );
}

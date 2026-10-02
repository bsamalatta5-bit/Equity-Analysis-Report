import { notFound } from "next/navigation";
import { isLocale } from "../../lib/i18n/locales";
import { HomeShell } from "./HomeShell";

export default async function LocaleHomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) {
    notFound();
  }
  return <HomeShell locale={locale} />;
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale } from "../../../../lib/i18n/locales";
import { ar } from "../../../../lib/i18n/messages/ar";
import { en } from "../../../../lib/i18n/messages/en";
import { SettingsView } from "./SettingsView";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return { title: locale === "ar" ? ar.settings.title : en.settings.title };
}

export default async function SettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) {
    notFound();
  }
  return <SettingsView />;
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale } from "../../../../lib/i18n/locales";
import { ar } from "../../../../lib/i18n/messages/ar";
import { en } from "../../../../lib/i18n/messages/en";
import { UsageView } from "./UsageView";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return { title: locale === "ar" ? ar.usage.title : en.usage.title };
}

export default async function UsagePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) {
    notFound();
  }
  return <UsageView />;
}

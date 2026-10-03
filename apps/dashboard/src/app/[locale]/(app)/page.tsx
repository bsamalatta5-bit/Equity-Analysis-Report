import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale } from "../../../lib/i18n/locales";
import { ar } from "../../../lib/i18n/messages/ar";
import { en } from "../../../lib/i18n/messages/en";
import { OperationsOverview } from "./OperationsOverview";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return { title: locale === "ar" ? ar.operations.title : en.operations.title };
}

export default async function OperationsOverviewPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) {
    notFound();
  }
  return <OperationsOverview locale={locale} />;
}

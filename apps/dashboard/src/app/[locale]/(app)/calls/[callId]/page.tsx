import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale } from "../../../../../lib/i18n/locales";
import { ar } from "../../../../../lib/i18n/messages/ar";
import { en } from "../../../../../lib/i18n/messages/en";
import { CallDetail } from "./CallDetail";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return { title: locale === "ar" ? ar.calls.detailTitle : en.calls.detailTitle };
}

export default async function CallDetailPage({
  params,
}: {
  params: Promise<{ locale: string; callId: string }>;
}) {
  const { locale, callId } = await params;
  if (!isLocale(locale)) {
    notFound();
  }
  return <CallDetail locale={locale} callId={callId} />;
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale } from "../../../../lib/i18n/locales";
import { ar } from "../../../../lib/i18n/messages/ar";
import { en } from "../../../../lib/i18n/messages/en";
import { StaffView } from "./StaffView";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return { title: locale === "ar" ? ar.staff.title : en.staff.title };
}

export default async function StaffPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) {
    notFound();
  }
  return <StaffView />;
}

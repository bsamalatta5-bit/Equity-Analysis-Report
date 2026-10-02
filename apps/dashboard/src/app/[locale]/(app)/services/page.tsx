import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale } from "../../../../lib/i18n/locales";
import { ar } from "../../../../lib/i18n/messages/ar";
import { en } from "../../../../lib/i18n/messages/en";
import { ServicesView } from "./ServicesView";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return { title: locale === "ar" ? ar.services.title : en.services.title };
}

export default async function ServicesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) {
    notFound();
  }
  return <ServicesView />;
}

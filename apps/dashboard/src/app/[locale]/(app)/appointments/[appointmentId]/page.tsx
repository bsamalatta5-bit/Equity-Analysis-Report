import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale } from "../../../../../lib/i18n/locales";
import { ar } from "../../../../../lib/i18n/messages/ar";
import { en } from "../../../../../lib/i18n/messages/en";
import { AppointmentDetail } from "./AppointmentDetail";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return { title: locale === "ar" ? ar.appointment.detailTitle : en.appointment.detailTitle };
}

export default async function AppointmentDetailPage({
  params,
}: {
  params: Promise<{ locale: string; appointmentId: string }>;
}) {
  const { locale, appointmentId } = await params;
  if (!isLocale(locale)) {
    notFound();
  }
  return <AppointmentDetail locale={locale} appointmentId={appointmentId} />;
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale } from "../../../../../lib/i18n/locales";
import { ar } from "../../../../../lib/i18n/messages/ar";
import { en } from "../../../../../lib/i18n/messages/en";
import { AppointmentForm } from "./AppointmentForm";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return { title: locale === "ar" ? ar.appointment.newAppointmentTitle : en.appointment.newAppointmentTitle };
}

export default async function NewAppointmentPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) {
    notFound();
  }
  return <AppointmentForm locale={locale} />;
}

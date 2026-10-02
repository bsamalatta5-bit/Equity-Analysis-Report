import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { isLocale } from "../../../lib/i18n/locales";
import { ar } from "../../../lib/i18n/messages/ar";
import { en } from "../../../lib/i18n/messages/en";
import { OnboardingWizardPage } from "./OnboardingWizard";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return { title: locale === "ar" ? ar.onboarding.wizardTitle : en.onboarding.wizardTitle };
}

export default async function OnboardingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) {
    notFound();
  }
  return <OnboardingWizardPage locale={locale} />;
}

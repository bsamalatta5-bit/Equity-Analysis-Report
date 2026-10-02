import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { isLocale } from "../../../lib/i18n/locales";
import { ar } from "../../../lib/i18n/messages/ar";
import { en } from "../../../lib/i18n/messages/en";
import { VerifyForm } from "./VerifyForm";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return { title: locale === "ar" ? ar.auth.totpTitle : en.auth.totpTitle };
}

export default async function VerifyPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ challengeToken?: string; mode?: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) {
    notFound();
  }
  const { challengeToken, mode } = await searchParams;
  if (!challengeToken || (mode !== "verify" && mode !== "enroll")) {
    redirect(`/${locale}/sign-in`);
  }
  return <VerifyForm locale={locale} challengeToken={challengeToken} mode={mode} />;
}

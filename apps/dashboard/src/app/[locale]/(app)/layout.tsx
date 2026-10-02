import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { isLocale } from "../../../lib/i18n/locales";
import { AppShellGuard } from "./AppShellGuard";

export default async function AuthenticatedLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) {
    notFound();
  }
  return <AppShellGuard locale={locale}>{children}</AppShellGuard>;
}

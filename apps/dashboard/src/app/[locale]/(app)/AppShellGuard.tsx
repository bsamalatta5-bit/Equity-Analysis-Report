"use client";

import type { ReactNode } from "react";
import type { Locale } from "../../../lib/i18n/locales";
import { AuthGuard } from "../../../components/auth/AuthGuard";
import { SessionProvider } from "../../../lib/auth/session-context";
import { AppShell } from "./AppShell";

export function AppShellGuard({ locale, children }: { locale: Locale; children: ReactNode }) {
  return (
    <AuthGuard locale={locale}>
      {(session) => (
        <SessionProvider session={session}>
          <AppShell locale={locale}>{children}</AppShell>
        </SessionProvider>
      )}
    </AuthGuard>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Locale } from "../../lib/i18n/locales";
import { useI18n } from "../../lib/i18n/provider";
import { AuthGuard } from "../../components/auth/AuthGuard";
import type { SessionInfo } from "../../lib/auth/api";
import { logout } from "../../lib/auth/api";
import { SESSION_QUERY_KEY } from "../../lib/auth/use-session";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";

export function HomeShell({ locale }: { locale: Locale }) {
  return (
    <AuthGuard locale={locale}>{(session) => <HomeContent locale={locale} session={session} />}</AuthGuard>
  );
}

function HomeContent({ locale, session }: { locale: Locale; session: SessionInfo }) {
  const { t } = useI18n();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const onSignOut = async () => {
    setIsSigningOut(true);
    try {
      await logout();
    } finally {
      queryClient.removeQueries({ queryKey: SESSION_QUERY_KEY });
      router.replace(`/${locale}/sign-in`);
    }
  };

  return (
    <main id="main-content" className="flex min-h-screen flex-col items-center gap-token-6 p-token-8">
      <h1 className="text-xl font-semibold text-text-primary">{t("home.welcomeTitle")}</h1>
      <Card className="w-full max-w-sm text-center">
        <p className="text-sm text-text-secondary">
          {t("home.signedInAs")}: <span className="font-medium text-text-primary">{session.role}</span>
        </p>
        <div className="mt-token-4 flex flex-col gap-token-2">
          {session.role === "tenant_owner" ? (
            <Link
              href={`/${locale}/onboarding`}
              className="inline-flex min-h-[2.5rem] items-center justify-center rounded-token border border-border px-token-4 text-sm font-semibold text-text-primary hover:bg-surface-raised"
            >
              {t("home.onboardingPrompt")}
            </Link>
          ) : null}
          <Button variant="secondary" onClick={() => void onSignOut()} isLoading={isSigningOut}>
            {t("auth.signOutButton")}
          </Button>
        </div>
      </Card>
    </main>
  );
}

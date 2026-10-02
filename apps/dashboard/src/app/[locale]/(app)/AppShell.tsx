"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Locale } from "../../../lib/i18n/locales";
import { useI18n } from "../../../lib/i18n/provider";
import type { MessagePath } from "../../../lib/i18n/message-path";
import { useCurrentSession } from "../../../lib/auth/session-context";
import { logout } from "../../../lib/auth/api";
import { SESSION_QUERY_KEY } from "../../../lib/auth/use-session";
import { Button } from "../../../components/ui/Button";

interface NavItem {
  href: string;
  labelKey: MessagePath;
}

const NAV_ITEMS: readonly NavItem[] = [
  { href: "", labelKey: "nav.operations" },
  { href: "/calendar", labelKey: "nav.calendar" },
  { href: "/calls", labelKey: "nav.calls" },
];

export function AppShell({ locale, children }: { locale: Locale; children: ReactNode }) {
  const { t } = useI18n();
  const session = useCurrentSession();
  const pathname = usePathname();
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
    <div className="flex min-h-screen">
      <nav
        aria-label={t("common.mainNavigationLabel")}
        className="flex w-56 flex-col gap-token-1 border-e border-border bg-surface-raised p-token-4"
      >
        {NAV_ITEMS.map((item) => {
          const href = `/${locale}${item.href}`;
          const isActive = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              aria-current={isActive ? "page" : undefined}
              className={`rounded-token px-token-3 py-token-2 text-sm font-medium ${
                isActive ? "bg-brand-100 text-brand-700" : "text-text-secondary hover:bg-surface"
              }`}
            >
              {t(item.labelKey)}
            </Link>
          );
        })}
      </nav>
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-border px-token-6 py-token-3">
          <p className="text-sm text-text-secondary">
            {t("home.signedInAs")}: <span className="font-medium text-text-primary">{session.role}</span>
          </p>
          <Button variant="secondary" onClick={() => void onSignOut()} isLoading={isSigningOut}>
            {t("auth.signOutButton")}
          </Button>
        </header>
        <main id="main-content" className="flex-1 p-token-6">
          {children}
        </main>
      </div>
    </div>
  );
}

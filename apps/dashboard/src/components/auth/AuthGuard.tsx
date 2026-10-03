"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import type { Locale } from "../../lib/i18n/locales";
import { isUnauthenticated, useSession } from "../../lib/auth/use-session";
import type { SessionInfo } from "../../lib/auth/api";
import { AsyncStateView } from "../states/AsyncStateView";
import { LoadingState } from "../states/LoadingState";

/**
 * Every authenticated screen is wrapped in this instead of re-deriving its
 * own "am I signed in" check — it owns the loading/error/offline states of
 * that check (A12.2) and treats an unauthenticated response as a redirect,
 * not an error to display.
 */
export function AuthGuard({
  locale,
  children,
}: {
  locale: Locale;
  children: (session: SessionInfo) => ReactNode;
}) {
  const router = useRouter();
  const query = useSession();
  const redirecting = query.isError && isUnauthenticated(query.error);

  useEffect(() => {
    if (redirecting) {
      router.replace(`/${locale}/sign-in`);
    }
  }, [redirecting, router, locale]);

  if (redirecting) {
    return <LoadingState />;
  }

  return (
    <AsyncStateView
      isLoading={query.isLoading}
      isError={query.isError}
      error={query.error}
      data={query.data}
      onRetry={() => void query.refetch()}
    >
      {(session) => children(session)}
    </AsyncStateView>
  );
}

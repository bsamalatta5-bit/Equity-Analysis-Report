"use client";

import type { ReactNode } from "react";
import { ApiError, NetworkError } from "../../lib/api/client";
import { useOnlineStatus } from "../../lib/hooks/use-online-status";
import { EmptyState } from "./EmptyState";
import { ErrorState } from "./ErrorState";
import { LoadingState } from "./LoadingState";
import { OfflineState } from "./OfflineState";

/**
 * A12.2: the single place every screen's loading/empty/error/offline state
 * is decided, so a screen cannot ship with only its success state wired up
 * — implementing a new screen means calling this with real query state,
 * not re-deriving these four branches by hand.
 */
export function AsyncStateView<T>({
  isLoading,
  isError,
  error,
  data,
  isEmpty,
  onRetry,
  loadingLabel,
  emptyTitle,
  emptyDescription,
  emptyAction,
  children,
}: {
  isLoading: boolean;
  isError: boolean;
  error?: unknown;
  data: T | undefined;
  isEmpty?: (data: T) => boolean;
  onRetry?: () => void;
  loadingLabel?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  children: (data: T) => ReactNode;
}) {
  const isOnline = useOnlineStatus();
  const isNetworkFailure = error instanceof NetworkError || !isOnline;

  if (isNetworkFailure && (isError || isLoading)) {
    return <OfflineState />;
  }
  if (isLoading) {
    return <LoadingState label={loadingLabel} />;
  }
  if (isError) {
    const message = error instanceof ApiError ? error.message : undefined;
    return <ErrorState message={message} onRetry={onRetry} />;
  }
  if (data === undefined || (isEmpty ? isEmpty(data) : false)) {
    return <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />;
  }
  return <>{children(data)}</>;
}

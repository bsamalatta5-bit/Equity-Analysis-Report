"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { SessionInfo } from "./api";

const SessionContext = createContext<SessionInfo | null>(null);

export function SessionProvider({ session, children }: { session: SessionInfo; children: ReactNode }) {
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}

/** Only ever rendered inside the authenticated (app) route group, where AuthGuard already resolved this. */
export function useCurrentSession(): SessionInfo {
  const session = useContext(SessionContext);
  if (!session) {
    throw new Error("useCurrentSession used outside the authenticated (app) route group.");
  }
  return session;
}

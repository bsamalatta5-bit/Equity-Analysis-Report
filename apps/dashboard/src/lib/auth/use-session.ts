"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchSession } from "./api";
import { ApiError } from "../api/client";

export const SESSION_QUERY_KEY = ["session"] as const;

export function useSession() {
  return useQuery({
    queryKey: SESSION_QUERY_KEY,
    queryFn: fetchSession,
    retry: false,
    staleTime: 60_000,
  });
}

/** Distinguishes "the server told us we're signed out" from any other failure. */
export function isUnauthenticated(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}

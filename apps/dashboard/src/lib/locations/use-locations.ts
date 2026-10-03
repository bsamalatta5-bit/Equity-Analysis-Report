"use client";

import { useQuery } from "@tanstack/react-query";
import { listLocations } from "./api";

export function useLocations(tenantId: string) {
  return useQuery({
    queryKey: ["locations", tenantId],
    queryFn: () => listLocations(tenantId),
  });
}

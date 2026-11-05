"use client";
import { useQuery } from "@tanstack/react-query";
import { apiFetchSingle } from "./api";
import type { PlayerDriversData } from "@/lib/dashboard-types";

/** The players behind each focus metric, for the Season progress page. */
export function usePlayerDrivers(enabled = true) {
  return useQuery({
    enabled,
    queryKey: ["playerDrivers"],
    queryFn: () => apiFetchSingle<PlayerDriversData>("/api/progress/drivers"),
    staleTime: 5 * 60_000,
  });
}

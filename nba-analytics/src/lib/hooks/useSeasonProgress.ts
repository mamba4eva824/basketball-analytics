"use client";
import { useQuery } from "@tanstack/react-query";
import { apiFetchSingle } from "./api";
import type { SeasonProgressData } from "@/lib/dashboard-types";

/** Season progress for the focus team (Season progress page and the dashboard scorecard). */
export function useSeasonProgress() {
  return useQuery({
    queryKey: ["seasonProgress"],
    queryFn: () => apiFetchSingle<SeasonProgressData>("/api/progress"),
    staleTime: 5 * 60_000,
  });
}

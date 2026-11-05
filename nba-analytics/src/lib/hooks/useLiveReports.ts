"use client";
import { useQuery } from "@tanstack/react-query";
import { apiFetchSingle } from "./api";
import type { LiveReportsResponse } from "@/lib/dashboard-types";

/**
 * In-game checkpoint reports for one game. While it's live, re-check every 20 s so a new
 * report (period midpoint or end) shows up soon after the mark; once it's final, stop.
 */
export function useLiveReports(gameId: string | undefined, live: boolean) {
  return useQuery({
    queryKey: ["liveReports", gameId],
    queryFn: () => apiFetchSingle<LiveReportsResponse>("/api/live/reports", { game: gameId }),
    enabled: !!gameId,
    refetchInterval: (query) => (query.state.status === "error" || !live ? false : 20_000),
    retry: 1,
    placeholderData: (prev) => prev,
  });
}

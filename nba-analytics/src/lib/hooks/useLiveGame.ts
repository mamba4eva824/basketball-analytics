"use client";
import { useQuery } from "@tanstack/react-query";
import { apiFetchSingle } from "./api";
import type { LiveGameResponse, LiveStatus } from "@/lib/dashboard-types";

/** Poll fast while the game is on, slowly before tip-off, and stop once it is final. */
function pollInterval(data: LiveGameResponse | undefined): number | false {
  if (!data) return 30_000;
  switch (data.kind) {
    case "live": return data.game.status === 2 ? 15_000 : false;
    case "pregame": return 60_000;
    default: return 5 * 60_000;
  }
}

export function useLiveGame(gameId?: string) {
  return useQuery({
    queryKey: ["liveGame", gameId ?? "today"],
    queryFn: () => apiFetchSingle<LiveGameResponse>("/api/live", { game: gameId }),
    // A failing feed (e.g. blocked off a home connection) stops polling; focus or Retry tries again
    refetchInterval: (query) => (query.state.status === "error" ? false : pollInterval(query.state.data)),
    retry: 1,
    placeholderData: (prev) => prev,
  });
}

/** Cheap scoreboard-only check for the LIVE badge; checks once a minute and stops on error. */
export function useLiveStatus() {
  return useQuery({
    queryKey: ["liveStatus"],
    queryFn: () => apiFetchSingle<LiveStatus>("/api/live/status"),
    refetchInterval: (query) => (query.state.status === "error" ? false : 60_000),
    retry: false,
  });
}

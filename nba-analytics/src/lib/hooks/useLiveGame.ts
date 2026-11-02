"use client";
import { useQuery } from "@tanstack/react-query";
import { apiFetchSingle } from "./api";
import type { LiveGameResponse, LiveStatus } from "@/lib/dashboard-types";

/**
 * Poll fast while the game is on (faster still while plays are read aloud), slowly before
 * tip-off, and stop once it is final.
 */
function pollInterval(data: LiveGameResponse | undefined, calls: boolean): number | false {
  if (!data) return 30_000;
  switch (data.kind) {
    case "live": return data.game.status === 2 ? (calls ? 4_000 : 15_000) : false;
    case "pregame": return 60_000;
    default: return 5 * 60_000;
  }
}

/** `calls`: also fetch the spoken play-by-play (for "Read plays aloud"). */
export function useLiveGame(gameId?: string, { calls = false }: { calls?: boolean } = {}) {
  return useQuery({
    queryKey: ["liveGame", gameId ?? "today", calls],
    queryFn: () => apiFetchSingle<LiveGameResponse>("/api/live", { game: gameId, calls: calls ? "1" : undefined }),
    // A failing feed (e.g. blocked off a home connection) stops polling; focus or Retry tries again
    refetchInterval: (query) => (query.state.status === "error" ? false : pollInterval(query.state.data, calls)),
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

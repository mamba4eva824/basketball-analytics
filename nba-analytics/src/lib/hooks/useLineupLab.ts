"use client";
import { useQuery } from "@tanstack/react-query";
import { apiFetchSingle } from "./api";
import type { LineupLabData } from "@/lib/dashboard-types";

/** Lineup Lab: the player pool plus, for a selection, the comparison rows (recomputed on every change). */
export function useLineupLab(on: string[], off: string[]) {
  return useQuery({
    queryKey: ["lineupLab", on.join(","), off.join(",")],
    queryFn: () => apiFetchSingle<LineupLabData>("/api/lineups", { on: on.join(",") || undefined, off: off.join(",") || undefined }),
    placeholderData: (prev) => prev,
  });
}

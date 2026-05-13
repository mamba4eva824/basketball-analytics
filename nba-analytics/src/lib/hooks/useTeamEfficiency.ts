"use client";
import { useQuery } from "@tanstack/react-query";
import { apiFetchSingle } from "./api";

const DEFAULT_SEASON = "2025-26";

export interface GameEfficiency {
  gameId: string;
  gameDate: string;
  offRating: number;
  defRating: number;
  netRating: number;
  pace: number;
  possessions: number;
  result: "W" | "L";
  homeAway: "HOME" | "AWAY";
}

export interface EfficiencySnapshot {
  window: string;
  snapshotDate: string;
  offRating: number;
  defRating: number;
  netRating: number;
  pace: number;
  wins: number;
  losses: number;
  winPct: number;
  effectiveFgPct: number;
  turnoverPct: number;
  offReboundPct: number;
  freeThrowRate: number;
  oppEffectiveFgPct: number;
  oppTurnoverPct: number;
  oppOffReboundPct: number;
  oppFreeThrowRate: number;
}

export interface TeamEfficiencyData {
  team: { id: string; abbreviation: string; name: string };
  season: string;
  gameEfficiency: GameEfficiency[];
  snapshots: EfficiencySnapshot[];
}

export function useTeamEfficiency(
  teamId: string,
  season: string = DEFAULT_SEASON,
  type: "game" | "snapshot" | "both" = "both"
) {
  return useQuery({
    queryKey: ["teamEfficiency", teamId, season, type],
    queryFn: () =>
      apiFetchSingle<TeamEfficiencyData>(
        `/api/teams/${teamId}/efficiency`,
        { season, type }
      ),
    enabled: !!teamId,
  });
}

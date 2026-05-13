"use client";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "./api";
import type { TrendPoint, TrendMetric } from "@/lib/types";

export function usePlayerTrends(playerId: string, metric: TrendMetric, options?: { season?: string; window?: number }) {
  const season = options?.season ?? "2025-26";
  const window = options?.window ?? 10;
  return useQuery({
    queryKey: ["playerTrends", playerId, metric, season, window],
    queryFn: async () => {
      const r = await apiFetch<any>(`/api/players/${playerId}/trends`, { metric, season, window });
      // API may return { trend: TrendPoint[] } or a direct array
      const data = r.data;
      if (Array.isArray(data)) return data as TrendPoint[];
      if (data && Array.isArray(data.trend)) return data.trend as TrendPoint[];
      return [];
    },
    enabled: !!playerId && !!metric,
  });
}

export const TREND_METRIC_OPTIONS: { value: TrendMetric; label: string }[] = [
  { value: "points", label: "Points" },
  { value: "assists", label: "Assists" },
  { value: "totalRebounds", label: "Rebounds" },
  { value: "steals", label: "Steals" },
  { value: "blocks", label: "Blocks" },
  { value: "turnovers", label: "Turnovers" },
  { value: "minutes", label: "Minutes" },
  { value: "plusMinus", label: "+/-" },
  { value: "fieldGoalPct", label: "FG%" },
  { value: "threePointPct", label: "3P%" },
  { value: "freeThrowPct", label: "FT%" },
  { value: "effectiveFGPct", label: "eFG%" },
  { value: "trueShootingPct", label: "TS%" },
  { value: "usageRate", label: "Usage Rate" },
  { value: "offensiveRating", label: "Off Rating" },
  { value: "defensiveRating", label: "Def Rating" },
  { value: "netRating", label: "Net Rating" },
  { value: "gameScore", label: "Game Score" },
  { value: "fantasyPoints", label: "Fantasy Pts" },
  { value: "playerImpactEstimate", label: "PIE" },
];

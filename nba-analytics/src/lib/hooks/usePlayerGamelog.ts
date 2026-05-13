"use client";
import { useQuery } from "@tanstack/react-query";
import { apiFetch, apiFetchSingle } from "./api";
import type { Player, PlayerWithTeamDetail, PlayerGameLog, PlayerSeasonStats, ShotChartEntry } from "@/lib/types";

const DEFAULT_SEASON = "2025-26";

export function usePlayers(params?: { teamId?: string; search?: string; page?: number; pageSize?: number }) {
  return useQuery({
    queryKey: ["players", params],
    queryFn: () => apiFetch<Player[]>("/api/players", { teamId: params?.teamId, search: params?.search, page: params?.page, pageSize: params?.pageSize ?? 50 }),
  });
}

export function usePlayer(playerId: string) {
  return useQuery({
    queryKey: ["player", playerId],
    queryFn: () => apiFetchSingle<PlayerWithTeamDetail>(`/api/players/${playerId}`),
    enabled: !!playerId,
  });
}

export function usePlayerGamelog(playerId: string, options?: { season?: string; last?: number }) {
  const season = options?.season ?? DEFAULT_SEASON;
  return useQuery({
    queryKey: ["playerGamelog", playerId, season, options?.last],
    queryFn: async () => {
      const r = await apiFetch<any[]>(`/api/players/${playerId}/gamelog`, { season, last: options?.last });
      // Normalize API field names to match PlayerGameLog type
      return r.data.map((g: any) => ({
        ...g,
        fieldGoalsMade: g.fieldGoalsMade ?? g.fieldGoals ?? 0,
        fieldGoalsAttempted: g.fieldGoalsAttempted ?? g.fieldGoalAtt ?? 0,
        threePointersMade: g.threePointersMade ?? g.threePointers ?? 0,
        threePointersAttempted: g.threePointersAttempted ?? g.threePointAtt ?? 0,
        freeThrowsMade: g.freeThrowsMade ?? g.freeThrows ?? 0,
        freeThrowsAttempted: g.freeThrowsAttempted ?? g.freeThrowAtt ?? 0,
        offRebounds: g.offRebounds ?? g.reboundsOff ?? 0,
        defRebounds: g.defRebounds ?? g.reboundsDef ?? 0,
        totalRebounds: g.totalRebounds ?? g.reboundsTotal ?? 0,
      })) as PlayerGameLog[];
    },
    enabled: !!playerId,
  });
}

export function usePlayerStats(playerId: string, season?: string) {
  return useQuery({
    queryKey: ["playerStats", playerId, season],
    queryFn: async (): Promise<PlayerSeasonStats | PlayerSeasonStats[]> => {
      if (season) return apiFetchSingle<PlayerSeasonStats>(`/api/players/${playerId}/stats`, { season });
      return apiFetch<PlayerSeasonStats[]>(`/api/players/${playerId}/stats`).then((r) => r.data);
    },
    enabled: !!playerId,
  });
}

export function usePlayerShots(playerId: string, season: string = DEFAULT_SEASON) {
  return useQuery({
    queryKey: ["playerShots", playerId, season],
    queryFn: async () => {
      const r = await apiFetch<any>(`/api/players/${playerId}/shots`, { season });
      const data = r.data;
      // API may return { shots: [...] } wrapper or a direct array
      const shotsArray = Array.isArray(data) ? data : (data?.shots ?? []);
      // Normalize field names
      return shotsArray.map((s: any) => ({
        ...s,
        locationX: s.locationX ?? s.locX ?? 0,
        locationY: s.locationY ?? s.locY ?? 0,
        made: s.made ?? (s.shotResult === "MADE"),
        shotDistance: s.shotDistance ?? 0,
        shotZone: s.shotZone ?? "UNKNOWN",
        shotType: s.shotType ?? s.actionType ?? "OTHER",
        minutesRemaining: s.minutesRemaining ?? 0,
        secondsRemaining: s.secondsRemaining ?? 0,
        period: s.period ?? 1,
      })) as ShotChartEntry[];
    },
    enabled: !!playerId,
  });
}

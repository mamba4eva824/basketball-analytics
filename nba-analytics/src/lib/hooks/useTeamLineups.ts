"use client";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "./api";
import { CURRENT_SEASON } from "@/lib/constants";

const DEFAULT_SEASON = CURRENT_SEASON;

export interface LineupPlayer {
  id: string;
  fullName: string;
  position: string;
  headshotUrl?: string;
}

export interface Lineup {
  id: string;
  lineupKey: string;
  players: LineupPlayer[];
  gamesPlayed: number;
  totalMinutes: number;
  offRating: number;
  defRating: number;
  netRating: number;
  pace: number;
  points: number;
  oppPoints: number;
  fieldGoalPct: number;
  threePointPct: number;
  freeThrowPct: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  plusMinus: number;
}

export function useTeamLineups(
  teamId: string,
  options?: {
    season?: string;
    sortBy?: string;
    sortDir?: "asc" | "desc";
    minMinutes?: number;
    page?: number;
    pageSize?: number;
  }
) {
  const season = options?.season ?? DEFAULT_SEASON;
  return useQuery({
    queryKey: ["teamLineups", teamId, season, options],
    queryFn: () =>
      apiFetch<Lineup[]>(`/api/teams/${teamId}/lineups`, {
        season,
        sortBy: options?.sortBy,
        sortDir: options?.sortDir,
        minMinutes: options?.minMinutes,
        page: options?.page,
        pageSize: options?.pageSize ?? 10,
      }),
    enabled: !!teamId,
  });
}

"use client";
import { useQuery } from "@tanstack/react-query";
import { apiFetchSingle } from "./api";
import { CURRENT_SEASON, FOCUS_TEAM_ID } from "@/lib/constants";
import type { MatchupData, TeamDashboardData } from "@/lib/dashboard-types";

export function useTeamDashboard(teamId: string = FOCUS_TEAM_ID, season: string = CURRENT_SEASON) {
  return useQuery({
    queryKey: ["teamDashboard", teamId, season],
    queryFn: () => apiFetchSingle<TeamDashboardData>(`/api/dashboard/team/${teamId}`, { season }),
    enabled: !!teamId,
  });
}

export function useMatchup(opponentId?: string, season: string = CURRENT_SEASON) {
  return useQuery({
    queryKey: ["matchup", FOCUS_TEAM_ID, opponentId ?? "next", season],
    queryFn: () => apiFetchSingle<MatchupData>("/api/matchup", { team: FOCUS_TEAM_ID, opponent: opponentId, season }),
    placeholderData: (prev) => prev,
  });
}

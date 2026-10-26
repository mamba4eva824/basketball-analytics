"use client";
import { useQuery } from "@tanstack/react-query";
import { apiFetchSingle } from "./api";
import { CURRENT_SEASON, FOCUS_TEAM_ID } from "@/lib/constants";
import type { AdvancedTeamData } from "@/lib/dashboard-types";

export function useAdvancedTeam(teamId: string = FOCUS_TEAM_ID, season: string = CURRENT_SEASON) {
  return useQuery({
    queryKey: ["advancedTeam", teamId, season],
    queryFn: () => apiFetchSingle<AdvancedTeamData>(`/api/advanced/team/${teamId}`, { season }),
  });
}

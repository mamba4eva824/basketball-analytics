"use client";
import { useQuery } from "@tanstack/react-query";
import { apiFetchSingle } from "./api";
import { CURRENT_SEASON, FOCUS_TEAM_ID } from "@/lib/constants";
import type { AdvancedPlayersData } from "@/lib/dashboard-types";

export function useAdvancedPlayers(teamId: string = FOCUS_TEAM_ID, season: string = CURRENT_SEASON) {
  return useQuery({
    queryKey: ["advancedPlayers", teamId, season],
    queryFn: () => apiFetchSingle<AdvancedPlayersData>(`/api/advanced/players/${teamId}`, { season }),
  });
}

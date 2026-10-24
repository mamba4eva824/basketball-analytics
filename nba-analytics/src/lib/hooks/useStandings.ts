"use client";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "./api";
import type { Standing, Conference } from "@/lib/types";
import { CURRENT_SEASON } from "@/lib/constants";

interface StandingsResponse {
  season: string | null;
  asOfDate: string | null;
  east: Standing[];
  west: Standing[];
}

export function useStandings(season: string = CURRENT_SEASON, conference?: Conference) {
  return useQuery({
    queryKey: ["standings", season, conference],
    queryFn: () => apiFetch<StandingsResponse>("/api/standings", { season, conference }).then((r) => r.data),
  });
}

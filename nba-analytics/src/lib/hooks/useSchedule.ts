"use client";
import { useQuery } from "@tanstack/react-query";
import { apiFetchSingle } from "./api";
import { CURRENT_SEASON } from "@/lib/constants";
import type { ScheduleData } from "@/lib/dashboard-types";

export function useSchedule(season: string = CURRENT_SEASON) {
  return useQuery({
    queryKey: ["schedule", season],
    queryFn: () => apiFetchSingle<ScheduleData>("/api/schedule", { season }),
  });
}

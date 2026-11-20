"use client";
import { useQuery } from "@tanstack/react-query";
import { apiFetchSingle } from "./api";
import type { StarOffData } from "@/lib/dashboard-types";

/** "When Luka sits": the team with one player off the floor (default Luka Dončić). */
export function useStarOff(player: string | null) {
  return useQuery({
    queryKey: ["starOff", player ?? "default"],
    queryFn: () => apiFetchSingle<StarOffData>("/api/star-off", { player: player ?? undefined }),
    placeholderData: (prev) => prev,
  });
}

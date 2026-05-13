"use client";
import { useQuery } from "@tanstack/react-query";
import { apiFetch, apiFetchSingle } from "./api";
import type { TeamDetail, TeamSeasonStats, GameBoxScore, RosterPlayer } from "@/lib/types";

const DEFAULT_SEASON = "2025-26";

export function useTeam(teamId: string) {
  return useQuery({
    queryKey: ["team", teamId],
    queryFn: async () => {
      const raw: any = await apiFetchSingle<any>(`/api/teams/${teamId}`);
      // Normalize: API may return "name" instead of "fullName"
      return {
        ...raw,
        fullName: raw.fullName ?? raw.name ?? "",
        conference: normalizeConference(raw.conference),
        division: raw.division ?? "",
      } as TeamDetail;
    },
    enabled: !!teamId,
  });
}

function normalizeConference(conf: string | undefined): string {
  if (!conf) return "";
  const upper = conf.toUpperCase();
  if (upper === "WEST" || upper === "WESTERN") return "West";
  if (upper === "EAST" || upper === "EASTERN") return "East";
  return conf;
}

export function useTeamStats(teamId: string, season: string = DEFAULT_SEASON) {
  return useQuery({
    queryKey: ["teamStats", teamId, season],
    queryFn: async () => {
      const raw: any = await apiFetchSingle<any>(`/api/teams/${teamId}/stats`, { season });
      // API may return flat TeamSeasonStats or nested { record, perGame, advanced }
      if (raw.record || raw.perGame || raw.advanced) {
        return {
          ...raw,
          wins: raw.record?.wins ?? raw.wins,
          losses: raw.record?.losses ?? raw.losses,
          winPct: raw.record?.winPct ?? raw.winPct,
          pointsPerGame: raw.perGame?.pointsPerGame ?? raw.pointsPerGame,
          opponentPPG: raw.perGame?.oppPointsPerGame ?? raw.opponentPPG,
          fieldGoalPct: raw.perGame?.fieldGoalPct ?? raw.fieldGoalPct,
          threePointPct: raw.perGame?.threePointPct ?? raw.threePointPct,
          freeThrowPct: raw.perGame?.freeThrowPct ?? raw.freeThrowPct,
          reboundsPerGame: raw.perGame?.reboundsPerGame ?? raw.reboundsPerGame,
          assistsPerGame: raw.perGame?.assistsPerGame ?? raw.assistsPerGame,
          stealsPerGame: raw.perGame?.stealsPerGame ?? raw.stealsPerGame,
          blocksPerGame: raw.perGame?.blocksPerGame ?? raw.blocksPerGame,
          turnoversPerGame: raw.perGame?.turnoversPerGame ?? raw.turnoversPerGame,
          offensiveRating: raw.advanced?.offRtg ?? raw.offensiveRating,
          defensiveRating: raw.advanced?.defRtg ?? raw.defensiveRating,
          netRating: raw.advanced?.netRtg ?? raw.netRating,
          pace: raw.advanced?.pace ?? raw.pace,
          effectiveFGPct: raw.advanced?.efgPct ?? raw.effectiveFGPct,
          trueShootingPct: raw.advanced?.tsPct ?? raw.trueShootingPct,
          turnoverRate: raw.advanced?.tovPct ?? raw.turnoverRate,
          offRebPct: raw.advanced?.orbPct ?? raw.offRebPct,
          freeThrowRate: raw.advanced?.ftRate ?? raw.freeThrowRate,
          opponentEffectiveFGPct: raw.advanced?.oppEfgPct ?? raw.opponentEffectiveFGPct,
          opponentTurnoverRate: raw.advanced?.oppTovPct ?? raw.opponentTurnoverRate,
          opponentFreeThrowRate: raw.advanced?.oppFtRate ?? raw.opponentFreeThrowRate,
        } as TeamSeasonStats;
      }
      return raw as TeamSeasonStats;
    },
    enabled: !!teamId,
  });
}

export function useTeamGames(teamId: string, options?: { season?: string; last?: number }) {
  const season = options?.season ?? DEFAULT_SEASON;
  return useQuery({
    queryKey: ["teamGames", teamId, season, options?.last],
    queryFn: async () => {
      const r = await apiFetch<any[]>(`/api/teams/${teamId}/games`, { season, last: options?.last });
      // Normalize API field names to match GameBoxScore type
      return r.data.map((g: any) => ({
        ...g,
        id: g.id ?? g.gameId,
        gameDate: g.gameDate,
        homeAway: g.homeAway,
        result: g.result,
        points: g.points ?? g.teamPoints ?? 0,
        opponentPoints: g.opponentPoints ?? g.oppPoints ?? 0,
        fieldGoalsMade: g.fieldGoalsMade ?? g.teamStats?.fieldGoals ?? 0,
        fieldGoalsAttempted: g.fieldGoalsAttempted ?? g.teamStats?.fieldGoalAtt ?? 0,
        fieldGoalPct: g.fieldGoalPct ?? g.teamStats?.fieldGoalPct ?? 0,
        threePointersMade: g.threePointersMade ?? g.teamStats?.threePointers ?? 0,
        threePointersAttempted: g.threePointersAttempted ?? g.teamStats?.threePointAtt ?? 0,
        threePointPct: g.threePointPct ?? g.teamStats?.threePointPct ?? 0,
        freeThrowsMade: g.freeThrowsMade ?? g.teamStats?.freeThrows ?? 0,
        freeThrowsAttempted: g.freeThrowsAttempted ?? g.teamStats?.freeThrowAtt ?? 0,
        freeThrowPct: g.freeThrowPct ?? g.teamStats?.freeThrowPct ?? 0,
        totalRebounds: g.totalRebounds ?? g.teamStats?.reboundsTotal ?? 0,
        assists: g.assists ?? g.teamStats?.assists ?? 0,
        steals: g.steals ?? g.teamStats?.steals ?? 0,
        blocks: g.blocks ?? g.teamStats?.blocks ?? 0,
        turnovers: g.turnovers ?? g.teamStats?.turnovers ?? 0,
        opponent: g.opponent,
      })) as GameBoxScore[];
    },
    enabled: !!teamId,
  });
}

export function useTeamRoster(teamId: string, season?: string) {
  return useQuery({
    queryKey: ["teamRoster", teamId, season],
    queryFn: async () => {
      const r = await apiFetch<any[]>(`/api/teams/${teamId}/roster`, { season });
      // Normalize roster player stats to match RosterPlayer type
      return r.data.map((p: any) => ({
        ...p,
        seasonStats: p.seasonStats ? {
          ...p.seasonStats,
          totalRebPerGame: p.seasonStats.totalRebPerGame ?? p.seasonStats.reboundsPerGame ?? 0,
        } : undefined,
      })) as RosterPlayer[];
    },
    enabled: !!teamId,
  });
}

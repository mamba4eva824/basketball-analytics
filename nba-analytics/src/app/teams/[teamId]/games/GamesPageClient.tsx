"use client";
import { useState, useMemo } from "react";
import Link from "next/link";
import { useTeam, useTeamGames } from "@/lib/hooks/useTeamStats";
import { TeamGameLogTable } from "@/components/tables/GameLogTable";
import { StatCard } from "@/components/layout/StatCard";
import { PageSkeleton } from "@/components/ui/LoadingSkeleton";
import { ErrorDisplay } from "@/components/ui/ErrorDisplay";
import { CURRENT_SEASON } from "@/lib/constants";

type FilterType = "all" | "W" | "L" | "HOME" | "AWAY";

export function GamesPageClient({ teamId }: { teamId: string }) {
  const { data: team, isLoading: tL } = useTeam(teamId);
  const {
    data: allGames,
    isLoading: gL,
    error,
    refetch,
  } = useTeamGames(teamId, { season: CURRENT_SEASON });
  const [filter, setFilter] = useState<FilterType>("all");

  const games = useMemo(() => {
    if (!allGames) return [];
    switch (filter) {
      case "W":
        return allGames.filter((g) => g.result === "W");
      case "L":
        return allGames.filter((g) => g.result === "L");
      case "HOME":
        return allGames.filter((g) => g.homeAway === "HOME");
      case "AWAY":
        return allGames.filter((g) => g.homeAway === "AWAY");
      default:
        return allGames;
    }
  }, [allGames, filter]);

  if (tL || gL) return <PageSkeleton />;
  if (error || !allGames)
    return (
      <ErrorDisplay
        title="Failed to load games"
        message={error?.message ?? "Could not load game data."}
        onRetry={() => refetch()}
      />
    );

  const wins = allGames.filter((g) => g.result === "W").length;
  const losses = allGames.filter((g) => g.result === "L").length;
  const avgPts =
    allGames.length > 0
      ? (
          allGames.reduce((s, g) => s + g.points, 0) / allGames.length
        ).toFixed(1)
      : "0";
  const avgOpp =
    allGames.length > 0
      ? (
          allGames.reduce((s, g) => s + g.opponentPoints, 0) /
          allGames.length
        ).toFixed(1)
      : "0";

  const filters: { label: string; value: FilterType }[] = [
    { label: "All", value: "all" },
    { label: "Wins", value: "W" },
    { label: "Losses", value: "L" },
    { label: "Home", value: "HOME" },
    { label: "Away", value: "AWAY" },
  ];

  return (
    <div className="space-y-6">
      {/* Breadcrumb & Header */}
      <div>
        <div className="flex items-center gap-2 text-sm text-text-faint mb-2">
          <Link
            href="/"
            className="hover:text-heading transition-colors"
          >
            {team?.fullName ?? "Team"}
          </Link>
          <span>/</span>
          <span className="text-text-secondary">Game Log</span>
        </div>
        <h1 className="text-3xl font-bold text-heading">
          {team?.fullName ?? "Team"} Game Log
        </h1>
        <p className="text-text-muted mt-1">{CURRENT_SEASON} Regular Season</p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Games" value={allGames.length} />
        <StatCard label="Record" value={`${wins}-${losses}`} subtitle={`${((wins / Math.max(1, allGames.length)) * 100).toFixed(1)}%`} />
        <StatCard label="Avg PTS" value={avgPts} />
        <StatCard label="Avg OPP" value={avgOpp} />
      </div>

      {/* Filters */}
      <div className="flex rounded-lg overflow-hidden border border-border-theme w-fit">
        {filters.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`px-4 py-2 text-sm transition-colors ${
              filter === f.value
                ? "bg-lakers-purple text-white"
                : "bg-input text-text-muted hover:text-text-primary"
            }`}
          >
            {f.label}
            {f.value !== "all" && (
              <span className="ml-1 text-xs opacity-60">
                (
                {f.value === "W"
                  ? wins
                  : f.value === "L"
                    ? losses
                    : f.value === "HOME"
                      ? allGames.filter((g) => g.homeAway === "HOME").length
                      : allGames.filter((g) => g.homeAway === "AWAY").length}
                )
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Game Log Table */}
      <TeamGameLogTable
        games={games}
        title={`${filter === "all" ? "All" : filter} Games (${games.length})`}
      />
    </div>
  );
}

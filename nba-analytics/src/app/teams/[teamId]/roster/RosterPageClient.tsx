"use client";
import Link from "next/link";
import { useTeam, useTeamRoster } from "@/lib/hooks/useTeamStats";
import { PlayerStatsTable } from "@/components/tables/PlayerStatsTable";
import { StatCard } from "@/components/layout/StatCard";
import { PageSkeleton } from "@/components/ui/LoadingSkeleton";
import { ErrorDisplay } from "@/components/ui/ErrorDisplay";
import { CURRENT_SEASON } from "@/lib/constants";

export function RosterPageClient({ teamId }: { teamId: string }) {
  const { data: team, isLoading: tL } = useTeam(teamId);
  const {
    data: roster,
    isLoading: rL,
    error,
    refetch,
  } = useTeamRoster(teamId, CURRENT_SEASON);

  if (tL || rL) return <PageSkeleton />;
  if (error || !roster)
    return (
      <ErrorDisplay
        title="Failed to load roster"
        message={error?.message ?? "Could not load roster data."}
        onRetry={() => refetch()}
      />
    );

  const activePlayers = roster.filter((p) => p.isActive);
  const avgPPG =
    roster.length > 0
      ? (
          roster.reduce((s, p) => s + (p.seasonStats?.pointsPerGame ?? 0), 0) /
          roster.length
        ).toFixed(1)
      : "0.0";
  const topScorer = [...roster].sort(
    (a, b) =>
      (b.seasonStats?.pointsPerGame ?? 0) -
      (a.seasonStats?.pointsPerGame ?? 0)
  )[0];
  const topRebounder = [...roster].sort(
    (a, b) =>
      (b.seasonStats?.totalRebPerGame ?? 0) -
      (a.seasonStats?.totalRebPerGame ?? 0)
  )[0];

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
          <span className="text-text-secondary">Roster</span>
        </div>
        <h1 className="text-3xl font-bold text-heading">
          {team?.fullName ?? "Team"} Roster
        </h1>
        <p className="text-text-muted mt-1">
          {CURRENT_SEASON} Season &middot; {roster.length} players
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Roster Size" value={roster.length} subtitle={`${activePlayers.length} active`} />
        <StatCard label="Avg PPG" value={avgPPG} subtitle="Team average" />
        <StatCard
          label="Top Scorer"
          value={topScorer?.seasonStats?.pointsPerGame?.toFixed(1) ?? "N/A"}
          subtitle={topScorer?.fullName ?? ""}
        />
        <StatCard
          label="Top Rebounder"
          value={topRebounder?.seasonStats?.totalRebPerGame?.toFixed(1) ?? "N/A"}
          subtitle={topRebounder?.fullName ?? ""}
        />
      </div>

      {/* Full Roster Table */}
      <PlayerStatsTable players={roster} title="Season Stats" />
    </div>
  );
}

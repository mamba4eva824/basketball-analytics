"use client";

import { useState } from "react";
import Link from "next/link";
import {
  usePlayer,
  usePlayerGamelog,
  usePlayerStats,
} from "@/lib/hooks/usePlayerGamelog";
import {
  usePlayerTrends,
  TREND_METRIC_OPTIONS,
} from "@/lib/hooks/usePlayerTrends";
import { StatCard } from "@/components/layout/StatCard";
import { TrendLine } from "@/components/charts/TrendLine";
import { ShootingChart } from "@/components/charts/ShootingChart";
import { PlayerGameLogTable } from "@/components/tables/GameLogTable";
import { PageSkeleton } from "@/components/ui/LoadingSkeleton";
import { ErrorDisplay } from "@/components/ui/ErrorDisplay";
import type { TrendMetric, PlayerSeasonStats } from "@/lib/types";
import { CURRENT_SEASON } from "@/lib/constants";

function fmtPct(val: number | null | undefined): string {
  if (val === null || val === undefined) return "N/A";
  return `${(val * 100).toFixed(1)}%`;
}

const PERCENTAGE_METRICS = new Set<TrendMetric>([
  "fieldGoalPct",
  "threePointPct",
  "freeThrowPct",
  "effectiveFGPct",
  "trueShootingPct",
]);

export function PlayerDashboardClient({ playerId }: { playerId: string }) {
  const [trendMetric, setTrendMetric] = useState<TrendMetric>("points");
  const [showAllGames, setShowAllGames] = useState(false);

  const {
    data: player,
    isLoading: playerLoading,
    error: playerError,
  } = usePlayer(playerId);
  const { data: seasonStats, isLoading: statsLoading } = usePlayerStats(
    playerId,
    CURRENT_SEASON
  ) as { data: PlayerSeasonStats | undefined; isLoading: boolean };
  const { data: recentGames } = usePlayerGamelog(playerId, {
    last: showAllGames ? undefined : 10,
  });
  const { data: allGames } = usePlayerGamelog(playerId, { season: CURRENT_SEASON });
  const { data: trendData } = usePlayerTrends(playerId, trendMetric, {
    season: CURRENT_SEASON,
  });

  if (playerLoading || statsLoading) {
    return <PageSkeleton />;
  }

  if (playerError || !player) {
    return (
      <ErrorDisplay
        title="Player not found"
        message={playerError?.message ?? "Could not load player data."}
      />
    );
  }

  // Normalize API field names to match the TypeScript type
  const rawStats = seasonStats as any;
  const stats: PlayerSeasonStats | undefined = rawStats ? {
    ...rawStats,
    fieldGoalsMadePerGame: rawStats.fieldGoalsMadePerGame ?? rawStats.fieldGoalsPerGame ?? 0,
    fieldGoalsAttPerGame: rawStats.fieldGoalsAttPerGame ?? rawStats.fieldGoalAttPerGame ?? 0,
    threePointMadePerGame: rawStats.threePointMadePerGame ?? rawStats.threePointersPerGame ?? 0,
    threePointAttPerGame: rawStats.threePointAttPerGame ?? rawStats.threePointAttPerGame ?? 0,
    freeThrowMadePerGame: rawStats.freeThrowMadePerGame ?? rawStats.freeThrowsPerGame ?? 0,
    freeThrowAttPerGame: rawStats.freeThrowAttPerGame ?? rawStats.freeThrowAttPerGame ?? 0,
    offRebPerGame: rawStats.offRebPerGame ?? rawStats.reboundsOffPerGame ?? 0,
    defRebPerGame: rawStats.defRebPerGame ?? rawStats.reboundsDefPerGame ?? 0,
    totalRebPerGame: rawStats.totalRebPerGame ?? rawStats.reboundsPerGame ?? 0,
    playerEfficiencyRating: rawStats.playerEfficiencyRating ?? rawStats.per ?? null,
    effectiveFGPct: rawStats.effectiveFGPct ?? rawStats.effectiveFgPct ?? null,
    trueShootingPct: rawStats.trueShootingPct ?? null,
    offensiveRating: rawStats.offensiveRating ?? rawStats.offRating ?? null,
    defensiveRating: rawStats.defensiveRating ?? rawStats.defRating ?? null,
    netRating: rawStats.netRating ?? null,
    valueOverReplacement: rawStats.valueOverReplacement ?? rawStats.vorp ?? null,
  } : undefined;

  return (
    <div className="space-y-6">
      {/* Player Bio Header */}
      <div className="glass-card p-6">
        <div className="flex flex-col md:flex-row md:items-center gap-6">
          {/* Player avatar */}
          <div className="w-20 h-20 rounded-xl bg-gradient-to-br from-lakers-purple to-lakers-gold flex items-center justify-center shrink-0">
            <span className="text-3xl font-bold text-white">
              {player.jerseyNumber ?? player.firstName[0]}
            </span>
          </div>

          <div className="flex-1">
            <h1 className="text-3xl font-bold text-heading">
              {player.fullName}
            </h1>
            <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-text-muted">
              {player.team && (
                <Link
                  href={`/teams/${player.team.id}`}
                  className="hover:text-heading transition-colors"
                >
                  {player.team.fullName}
                </Link>
              )}
              {player.position && (
                <>
                  <span className="text-text-faint">|</span>
                  <span>{player.position}</span>
                </>
              )}
              {player.height && (
                <>
                  <span className="text-text-faint">|</span>
                  <span>{player.height}</span>
                </>
              )}
              {player.weight && (
                <>
                  <span className="text-text-faint">|</span>
                  <span>{player.weight} lbs</span>
                </>
              )}
              {player.country && (
                <>
                  <span className="text-text-faint">|</span>
                  <span>{player.country}</span>
                </>
              )}
            </div>
            {player.draftYear && (
              <p className="text-xs text-text-faint mt-1">
                Draft: {player.draftYear} Round {player.draftRound}, Pick{" "}
                {player.draftNumber}
              </p>
            )}
            {player.fromYear && player.toYear && (
              <p className="text-xs text-text-faint">
                Active: {player.fromYear} - {player.toYear}
              </p>
            )}
          </div>

          {/* Quick actions */}
          <div className="flex flex-col gap-2">
            <Link
              href={`/players/${playerId}/shots`}
              className="px-4 py-2 rounded-lg bg-lakers-purple/30 border border-lakers-purple/40 text-sm text-heading hover:bg-lakers-purple/50 transition-colors whitespace-nowrap text-center"
            >
              Shot Chart &rarr;
            </Link>
            {player.team && (
              <Link
                href={`/teams/${player.team.id}`}
                className="px-4 py-2 rounded-lg bg-input border border-border-theme text-sm text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors whitespace-nowrap text-center"
              >
                Team Page
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Season Stats Summary */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
          <StatCard
            label="PPG"
            value={stats.pointsPerGame.toFixed(1)}
            subtitle={`${stats.gamesPlayed} games`}
          />
          <StatCard
            label="RPG"
            value={stats.totalRebPerGame.toFixed(1)}
          />
          <StatCard
            label="APG"
            value={stats.assistsPerGame.toFixed(1)}
          />
          <StatCard
            label="FG%"
            value={fmtPct(stats.fieldGoalPct)}
            subtitle={`${stats.fieldGoalsMadePerGame.toFixed(1)}/${stats.fieldGoalsAttPerGame.toFixed(1)}`}
          />
          <StatCard
            label="3P%"
            value={fmtPct(stats.threePointPct)}
            subtitle={`${stats.threePointMadePerGame.toFixed(1)}/${stats.threePointAttPerGame.toFixed(1)}`}
          />
          <StatCard
            label="FT%"
            value={fmtPct(stats.freeThrowPct)}
          />
        </div>
      )}

      {/* Advanced Stats Row */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
          <StatCard
            label="PER"
            value={stats.playerEfficiencyRating?.toFixed(1) ?? "N/A"}
          />
          <StatCard label="TS%" value={fmtPct(stats.trueShootingPct)} />
          <StatCard label="USG%" value={fmtPct(stats.usageRate)} />
          <StatCard label="STL" value={stats.stealsPerGame.toFixed(1)} />
          <StatCard label="BLK" value={stats.blocksPerGame.toFixed(1)} />
          <StatCard
            label="+/-"
            value={
              stats.plusMinusPerGame !== null &&
              stats.plusMinusPerGame !== undefined
                ? `${stats.plusMinusPerGame > 0 ? "+" : ""}${stats.plusMinusPerGame.toFixed(1)}`
                : "N/A"
            }
            trend={
              stats.plusMinusPerGame !== null &&
              stats.plusMinusPerGame !== undefined
                ? stats.plusMinusPerGame > 0
                  ? "up"
                  : stats.plusMinusPerGame < 0
                    ? "down"
                    : "neutral"
                : undefined
            }
          />
        </div>
      )}

      {/* Advanced Stats Detail */}
      {stats && (
        <div className="glass-card p-6">
          <h3 className="text-lg text-heading mb-4">Advanced Metrics</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-6">
            <AdvancedStatItem
              label="Win Shares"
              value={stats.winShares?.toFixed(1) ?? "N/A"}
            />
            <AdvancedStatItem
              label="BPM"
              value={stats.boxPlusMinus?.toFixed(1) ?? "N/A"}
            />
            <AdvancedStatItem
              label="VORP"
              value={stats.valueOverReplacement?.toFixed(1) ?? "N/A"}
            />
            <AdvancedStatItem
              label="Off Rating"
              value={stats.offensiveRating?.toFixed(1) ?? "N/A"}
            />
            <AdvancedStatItem
              label="Def Rating"
              value={stats.defensiveRating?.toFixed(1) ?? "N/A"}
            />
            <AdvancedStatItem
              label="Net Rating"
              value={stats.netRating?.toFixed(1) ?? "N/A"}
            />
          </div>
        </div>
      )}

      {/* Trend Chart */}
      <div className="glass-card p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <h3 className="text-lg text-heading">Performance Trends</h3>
          <select
            value={trendMetric}
            onChange={(e) =>
              setTrendMetric(e.target.value as TrendMetric)
            }
            className="bg-input border border-border-theme rounded-lg px-3 py-1.5 text-sm text-text-primary outline-none focus:border-lakers-purple/60 w-48"
          >
            {TREND_METRIC_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        {trendData && trendData.length > 0 ? (
          <TrendLine
            data={trendData}
            metricLabel={
              TREND_METRIC_OPTIONS.find((o) => o.value === trendMetric)
                ?.label ?? trendMetric
            }
            isPercentage={PERCENTAGE_METRICS.has(trendMetric)}
          />
        ) : (
          <div className="h-64 flex items-center justify-center text-text-faint">
            No trend data available
          </div>
        )}
      </div>

      {/* Shooting Splits Over Time */}
      {allGames && allGames.length > 0 && (
        <div className="glass-card p-6">
          <h3 className="text-lg text-heading mb-4">
            Shooting Splits Over Time
          </h3>
          <ShootingChart data={allGames} />
        </div>
      )}

      {/* Recent Games */}
      {recentGames && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg text-heading">
              {showAllGames ? "All Games" : "Recent Games (Last 10)"}
            </h3>
            <button
              onClick={() => setShowAllGames(!showAllGames)}
              className="text-sm text-lakers-purple-light hover:text-heading transition-colors"
            >
              {showAllGames ? "Show Last 10" : "View All Games"} &rarr;
            </button>
          </div>
          <PlayerGameLogTable games={recentGames} />
        </div>
      )}
    </div>
  );
}

function AdvancedStatItem({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="text-center">
      <p className="text-xs text-text-muted uppercase tracking-wider mb-1">
        {label}
      </p>
      <p className="text-xl font-bold font-mono text-text-primary">{value}</p>
    </div>
  );
}

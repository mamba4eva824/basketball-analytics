"use client";
import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { format } from "date-fns";
import { useTeam, useTeamStats, useTeamGames, useTeamRoster } from "@/lib/hooks/useTeamStats";
import { useTeamEfficiency } from "@/lib/hooks/useTeamEfficiency";
import { useThemeColors } from "@/lib/ThemeContext";
import { StatCard } from "@/components/layout/StatCard";
import { EfficiencyRadar } from "@/components/charts/EfficiencyRadar";
import { PlusMinusBar } from "@/components/charts/PlusMinusBar";
import { TeamGameLogTable } from "@/components/tables/GameLogTable";
import { PlayerStatsTable } from "@/components/tables/PlayerStatsTable";
import { PageSkeleton } from "@/components/ui/LoadingSkeleton";
import { ErrorDisplay } from "@/components/ui/ErrorDisplay";

function fmtPct(val: number | null | undefined): string {
  if (val == null) return "N/A";
  return `${(val * 100).toFixed(1)}%`;
}

export function TeamDashboardClient({ teamId }: { teamId: string }) {
  const { data: team, isLoading: tL, error: tE } = useTeam(teamId);
  const { data: stats, isLoading: sL } = useTeamStats(teamId);
  const { data: recentGames } = useTeamGames(teamId, { last: 10 });
  const { data: roster } = useTeamRoster(teamId, "2025-26");
  const { data: efficiency } = useTeamEfficiency(teamId);

  const chartRef = useRef<HTMLDivElement>(null);
  const [activeMetric, setActiveMetric] = useState<"offRtg" | "defRtg" | "netRtg" | null>(null);
  const colors = useThemeColors();

  const handleStatCardClick = (metric: "offRtg" | "defRtg" | "netRtg") => {
    setActiveMetric((prev) => (prev === metric ? null : metric));
    chartRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  // Build W/L streak bar from recent games
  const streakBar = useMemo(() => {
    if (!recentGames) return null;
    return [...recentGames].reverse().slice(-20);
  }, [recentGames]);

  // Build +/- data from roster
  const plusMinusData = useMemo(() => {
    if (!roster) return [];
    return roster
      .filter((p) => p.seasonStats && p.seasonStats.gamesPlayed >= 10)
      .map((p) => ({
        name: p.fullName.split(" ").pop() ?? p.fullName,
        plusMinus: (p.seasonStats?.pointsPerGame ?? 0) - 10, // approximation since per-game +/- may not be in roster stats
        playerId: p.id,
      }))
      .sort((a, b) => b.plusMinus - a.plusMinus)
      .slice(0, 10);
  }, [roster]);

  // Build OffRtg/DefRtg/NetRtg trend from efficiency data
  const ratingTrendData = useMemo(() => {
    if (!efficiency?.gameEfficiency) return [];
    return efficiency.gameEfficiency.map((g) => ({
      date: format(new Date(g.gameDate), "MMM d"),
      offRtg: g.offRating,
      defRtg: g.defRating,
      netRtg: g.netRating,
    }));
  }, [efficiency]);

  if (tL || sL) return <PageSkeleton />;
  if (tE || !team) return <ErrorDisplay title="Team not found" message={tE?.message ?? "Could not load team data."} />;

  return (
    <div className="space-y-6">
      {/* Team Header */}
      <div className="glass-card p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-heading">{team.fullName}</h1>
            <p className="text-text-muted mt-1">
              {team.conference}ern Conference &middot; {team.division} Division
            </p>
            <div className="flex gap-2 mt-3">
              <Link
                href="/roster"
                className="px-3 py-1.5 rounded-lg text-xs bg-lakers-purple/20 border border-lakers-purple/30 text-heading hover:bg-lakers-purple/40 transition-colors"
              >
                Roster
              </Link>
              <Link
                href="/games"
                className="px-3 py-1.5 rounded-lg text-xs bg-lakers-purple/20 border border-lakers-purple/30 text-heading hover:bg-lakers-purple/40 transition-colors"
              >
                Game Log
              </Link>
            </div>
          </div>
          {stats && (
            <div className="flex items-center gap-6">
              <div className="text-center">
                <p className="text-3xl font-bold font-mono text-text-primary">
                  {stats.wins}-{stats.losses}
                </p>
                <p className="text-xs text-text-faint uppercase tracking-wider">
                  Record
                </p>
              </div>
              {stats.streakType && stats.streakCount && (
                <div className="text-center">
                  <p
                    className={`text-xl font-bold font-mono ${
                      stats.streakType === "W" ? "text-green-400" : "text-red-400"
                    }`}
                  >
                    {stats.streakType}
                    {stats.streakCount}
                  </p>
                  <p className="text-xs text-text-faint uppercase tracking-wider">
                    Streak
                  </p>
                </div>
              )}
              {stats.last10Wins != null && stats.last10Losses != null && (
                <div className="text-center">
                  <p className="text-xl font-bold font-mono text-text-primary">
                    {stats.last10Wins}-{stats.last10Losses}
                  </p>
                  <p className="text-xs text-text-faint uppercase tracking-wider">
                    Last 10
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* W/L Streak Bar */}
        {streakBar && streakBar.length > 0 && (
          <div className="mt-4 pt-4 border-t border-border-theme">
            <p className="text-xs text-text-faint mb-2 uppercase tracking-wider">
              Recent Results
            </p>
            <div className="flex gap-1">
              {streakBar.map((g) => (
                <div
                  key={g.id}
                  className={`h-6 flex-1 rounded-sm flex items-center justify-center text-[9px] font-bold transition-all ${
                    g.result === "W"
                      ? "bg-green-500/30 text-green-400"
                      : "bg-red-500/30 text-red-400"
                  }`}
                  title={`${g.result} ${g.points}-${g.opponentPoints} vs ${g.opponent?.abbreviation ?? "OPP"}`}
                >
                  {g.result}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Core Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label="Offensive Rating"
            value={stats.offensiveRating?.toFixed(1) ?? "N/A"}
            subtitle="Points per 100 possessions"
            onClick={() => handleStatCardClick("offRtg")}
            selected={activeMetric === "offRtg"}
          />
          <StatCard
            label="Defensive Rating"
            value={stats.defensiveRating?.toFixed(1) ?? "N/A"}
            subtitle="Opp points per 100 poss"
            trend={
              stats.defensiveRating
                ? stats.defensiveRating < 112
                  ? "up"
                  : "down"
                : undefined
            }
            onClick={() => handleStatCardClick("defRtg")}
            selected={activeMetric === "defRtg"}
          />
          <StatCard
            label="Net Rating"
            value={stats.netRating?.toFixed(1) ?? "N/A"}
            subtitle="OffRtg - DefRtg"
            trend={
              stats.netRating
                ? stats.netRating > 0
                  ? "up"
                  : "down"
                : undefined
            }
            onClick={() => handleStatCardClick("netRtg")}
            selected={activeMetric === "netRtg"}
          />
          <StatCard
            label="Pace"
            value={stats.pace?.toFixed(1) ?? "N/A"}
            subtitle="Possessions per 48 min"
          />
        </div>
      )}

      {/* Team Per-Game Stats */}
      {stats && (
        <div>
          <h3 className="text-lg text-heading mb-3">Team Per-Game Stats</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="FG%" value={fmtPct(stats.fieldGoalPct)} />
            <StatCard label="3P%" value={fmtPct(stats.threePointPct)} />
            <StatCard label="FT%" value={fmtPct(stats.freeThrowPct)} />
            <StatCard label="RPG" value={stats.reboundsPerGame != null ? stats.reboundsPerGame.toFixed(1) : "N/A"} />
            <StatCard label="APG" value={stats.assistsPerGame != null ? stats.assistsPerGame.toFixed(1) : "N/A"} />
            <StatCard label="SPG" value={stats.stealsPerGame != null ? stats.stealsPerGame.toFixed(1) : "N/A"} />
            <StatCard label="BPG" value={stats.blocksPerGame != null ? stats.blocksPerGame.toFixed(1) : "N/A"} />
            <StatCard label="TOPG" value={stats.turnoversPerGame != null ? stats.turnoversPerGame.toFixed(1) : "N/A"} />
          </div>
        </div>
      )}

      {/* Four Factors + Efficiency Radar */}
      {stats && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Four Factors */}
          <div className="glass-card p-6">
            <h3 className="text-lg text-heading mb-4">Four Factors</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-4">
                <FourFactorItem
                  label="eFG%"
                  value={fmtPct(stats.effectiveFGPct)}
                  barPct={Math.min(100, (stats.effectiveFGPct ?? 0) * 100 * 1.8)}
                  color="bg-lakers-gold"
                />
                <FourFactorItem
                  label="TOV Rate"
                  value={fmtPct(stats.turnoverRate)}
                  barPct={Math.min(100, (stats.turnoverRate ?? 0) * 100 * 5)}
                  color="bg-lakers-purple"
                />
              </div>
              <div className="space-y-4">
                <FourFactorItem
                  label="OREB%"
                  value={fmtPct(stats.offRebPct)}
                  barPct={Math.min(100, (stats.offRebPct ?? 0) * 100 * 3)}
                  color="bg-lakers-gold"
                />
                <FourFactorItem
                  label="FT Rate"
                  value={fmtPct(stats.freeThrowRate)}
                  barPct={Math.min(100, (stats.freeThrowRate ?? 0) * 100 * 3)}
                  color="bg-lakers-purple-light"
                />
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-border-theme grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-xs text-text-muted">PPG</p>
                <p className="font-mono text-text-primary font-bold">
                  {(stats.pointsPerGame ?? 0).toFixed(1)}
                </p>
              </div>
              <div>
                <p className="text-xs text-text-muted">OPP PPG</p>
                <p className="font-mono text-text-primary font-bold">
                  {(stats.opponentPPG ?? 0).toFixed(1)}
                </p>
              </div>
              <div>
                <p className="text-xs text-text-muted">Win%</p>
                <p className="font-mono text-text-primary font-bold">
                  {fmtPct(stats.winPct)}
                </p>
              </div>
            </div>
          </div>

          {/* Efficiency Radar */}
          <div className="glass-card p-6">
            <h3 className="text-lg text-heading mb-2">
              Efficiency Profile
            </h3>
            <EfficiencyRadar stats={stats} />
          </div>
        </div>
      )}

      {/* Rating Trend Chart */}
      {ratingTrendData.length > 0 && (
        <div ref={chartRef} className="glass-card p-6">
          <h3 className="text-lg text-heading mb-4">
            {activeMetric === "offRtg"
              ? "Offensive Rating Trend"
              : activeMetric === "defRtg"
              ? "Defensive Rating Trend"
              : activeMetric === "netRtg"
              ? "Net Rating Trend"
              : "Rating Trends"}
          </h3>
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={ratingTrendData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} />
              <XAxis dataKey="date" tick={{ fill: colors.tick, fontSize: 11 }} tickLine={false} axisLine={{ stroke: colors.axis }} interval="preserveStartEnd" />
              <YAxis tick={{ fill: colors.tick, fontSize: 11 }} tickLine={false} axisLine={{ stroke: colors.axis }} width={45} />
              <Tooltip
                contentStyle={{ backgroundColor: colors.tooltipBg, border: `1px solid ${colors.tooltipBorder}`, borderRadius: "8px", fontSize: "12px" }}
                labelStyle={{ color: colors.tooltipLabel }}
                formatter={(val) => [typeof val === "number" ? val.toFixed(1) : String(val ?? "")]}
              />
              <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "12px" }} />
              <Line type="monotone" dataKey="offRtg" stroke="#552583" strokeWidth={activeMetric === "offRtg" ? 3 : activeMetric === null ? 2 : 1} strokeOpacity={activeMetric === null || activeMetric === "offRtg" ? 1 : 0.25} dot={{ r: 2, fill: "#552583" }} name="Off Rtg" connectNulls />
              <Line type="monotone" dataKey="defRtg" stroke="#E44D4D" strokeWidth={activeMetric === "defRtg" ? 3 : activeMetric === null ? 2 : 1} strokeOpacity={activeMetric === null || activeMetric === "defRtg" ? 1 : 0.25} dot={{ r: 2, fill: "#E44D4D" }} name="Def Rtg" connectNulls />
              <Line type="monotone" dataKey="netRtg" stroke="#FDB927" strokeWidth={activeMetric === "netRtg" ? 3 : activeMetric === null ? 2 : 1} strokeOpacity={activeMetric === null || activeMetric === "netRtg" ? 1 : 0.25} dot={{ r: 2, fill: "#FDB927" }} name="Net Rtg" connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Player Impact: +/- Bar */}
      {plusMinusData.length > 0 && (
        <div className="glass-card p-6">
          <h3 className="text-lg text-heading mb-4">
            Player Impact (PPG)
          </h3>
          <PlusMinusBar data={plusMinusData} />
        </div>
      )}

      {/* Recent Games */}
      {recentGames && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg text-heading">Recent Games</h3>
            <Link
              href="/games"
              className="text-sm text-lakers-purple-light hover:text-heading transition-colors"
            >
              View All Games &rarr;
            </Link>
          </div>
          <TeamGameLogTable games={recentGames} />
        </div>
      )}

      {/* Top Players */}
      {roster && roster.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg text-heading">Top Players</h3>
            <Link
              href="/roster"
              className="text-sm text-lakers-purple-light hover:text-heading transition-colors"
            >
              Full Roster &rarr;
            </Link>
          </div>
          <PlayerStatsTable players={roster} maxRows={8} />
        </div>
      )}
    </div>
  );
}

function FourFactorItem({
  label,
  value,
  barPct,
  color,
}: {
  label: string;
  value: string;
  barPct: number;
  color: string;
}) {
  return (
    <div>
      <p className="text-xs text-text-muted uppercase tracking-wider mb-1">
        {label}
      </p>
      <p className="text-2xl font-bold font-mono text-text-primary">{value}</p>
      <div className="mt-1 h-1.5 rounded-full bg-bar-bg overflow-hidden">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${barPct}%` }}
        />
      </div>
    </div>
  );
}

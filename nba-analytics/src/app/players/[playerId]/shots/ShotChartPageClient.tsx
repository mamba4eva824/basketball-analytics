"use client";

import { useMemo } from "react";
import Link from "next/link";
import { usePlayer, usePlayerShots } from "@/lib/hooks/usePlayerGamelog";
import { ShotChart } from "@/components/charts/ShotChart";
import { StatCard } from "@/components/layout/StatCard";
import { PageSkeleton } from "@/components/ui/LoadingSkeleton";
import { ErrorDisplay } from "@/components/ui/ErrorDisplay";
import { CURRENT_SEASON } from "@/lib/constants";

export function ShotChartPageClient({ playerId }: { playerId: string }) {
  const { data: player, isLoading: playerLoading } = usePlayer(playerId);
  const {
    data: shots,
    isLoading: shotsLoading,
    error,
    refetch,
  } = usePlayerShots(playerId);

  const zoneStats = useMemo(() => {
    if (!shots) return [];
    const zones = new Map<string, { made: number; total: number }>();
    for (const shot of shots) {
      const existing = zones.get(shot.shotZone) || { made: 0, total: 0 };
      existing.total++;
      if (shot.made) existing.made++;
      zones.set(shot.shotZone, existing);
    }
    return Array.from(zones.entries())
      .map(([zone, s]) => ({
        zone: zone.replace(/_/g, " "),
        ...s,
        pct: s.total > 0 ? ((s.made / s.total) * 100).toFixed(1) : "0.0",
      }))
      .sort((a, b) => b.total - a.total);
  }, [shots]);

  const shotTypeStats = useMemo(() => {
    if (!shots) return { twos: { made: 0, total: 0 }, threes: { made: 0, total: 0 } };
    const twos = { made: 0, total: 0 };
    const threes = { made: 0, total: 0 };
    for (const s of shots) {
      const zoneUpper = s.shotZone.toUpperCase();
      if (s.shotDistance >= 22 || zoneUpper.includes("THREE") || zoneUpper.includes("CORNER") || zoneUpper.includes("3")) {
        threes.total++;
        if (s.made) threes.made++;
      } else {
        twos.total++;
        if (s.made) twos.made++;
      }
    }
    return { twos, threes };
  }, [shots]);

  if (playerLoading || shotsLoading) {
    return <PageSkeleton />;
  }

  if (error || !shots) {
    return (
      <ErrorDisplay
        title="Failed to load shot data"
        message={error?.message ?? "Could not load shot chart data."}
        onRetry={() => refetch()}
      />
    );
  }

  const totalShots = shots.length;
  const totalMade = shots.filter((s) => s.made).length;
  const overallPct =
    totalShots > 0 ? ((totalMade / totalShots) * 100).toFixed(1) : "0.0";
  const twoPct = shotTypeStats.twos.total > 0
    ? ((shotTypeStats.twos.made / shotTypeStats.twos.total) * 100).toFixed(1)
    : "0.0";
  const threePct = shotTypeStats.threes.total > 0
    ? ((shotTypeStats.threes.made / shotTypeStats.threes.total) * 100).toFixed(1)
    : "0.0";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-sm text-text-faint mb-2">
          <Link
            href={`/players/${playerId}`}
            className="hover:text-heading transition-colors"
          >
            {player?.fullName ?? "Player"}
          </Link>
          <span>/</span>
          <span className="text-text-secondary">Shot Chart</span>
        </div>
        <h1 className="text-3xl font-bold text-heading">
          {player?.fullName ?? "Player"} Shot Chart
        </h1>
        <p className="text-text-muted mt-1">{CURRENT_SEASON} Regular Season</p>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <StatCard label="Total Shots" value={totalShots} />
        <StatCard label="Makes" value={totalMade} />
        <StatCard label="FG%" value={`${overallPct}%`} />
        <StatCard label="2PT" value={`${twoPct}%`} subtitle={`${shotTypeStats.twos.made}/${shotTypeStats.twos.total}`} />
        <StatCard label="3PT" value={`${threePct}%`} subtitle={`${shotTypeStats.threes.made}/${shotTypeStats.threes.total}`} />
        <StatCard label="Misses" value={totalShots - totalMade} />
      </div>

      {/* Shot Chart */}
      <ShotChart shots={shots} />

      {/* Zone Breakdown */}
      <div className="glass-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border-theme">
          <h3 className="text-lg text-heading">Zone Breakdown</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border-theme bg-surface-alt">
                <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-text-muted">
                  Zone
                </th>
                <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-text-muted">
                  Made
                </th>
                <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-text-muted">
                  Attempted
                </th>
                <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-text-muted">
                  FG%
                </th>
                <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-text-muted">
                  Freq
                </th>
                <th className="px-4 py-3 text-left text-xs uppercase tracking-wider text-text-muted">
                  Distribution
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-theme">
              {zoneStats.map((zone) => {
                const pctNum = parseFloat(zone.pct);
                return (
                  <tr
                    key={zone.zone}
                    className="hover:bg-lakers-purple/10 transition-colors"
                  >
                    <td className="px-4 py-3 text-sm text-text-primary capitalize">
                      {zone.zone.toLowerCase()}
                    </td>
                    <td className="px-4 py-3 font-mono text-sm text-lakers-gold">
                      {zone.made}
                    </td>
                    <td className="px-4 py-3 font-mono text-sm text-text-primary">
                      {zone.total}
                    </td>
                    <td className="px-4 py-3 font-mono text-sm">
                      <span className={pctNum >= 50 ? "text-green-400" : pctNum >= 40 ? "text-text-primary" : "text-red-400"}>
                        {zone.pct}%
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-sm text-text-muted">
                      {totalShots > 0
                        ? ((zone.total / totalShots) * 100).toFixed(1)
                        : "0.0"}
                      %
                    </td>
                    <td className="px-4 py-3 w-40">
                      <div className="h-2 rounded-full bg-bar-bg overflow-hidden">
                        <div
                          className="h-full rounded-full bg-lakers-gold"
                          style={{
                            width: `${totalShots > 0 ? (zone.total / totalShots) * 100 : 0}%`,
                          }}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

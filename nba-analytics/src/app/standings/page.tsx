"use client";

import Link from "next/link";
import { useStandings } from "@/lib/hooks/useStandings";
import { TeamLogo } from "@/components/ui/TeamLogo";
import { PageSkeleton } from "@/components/ui/LoadingSkeleton";
import { ErrorDisplay } from "@/components/ui/ErrorDisplay";
import type { Conference } from "@/lib/types";
import { CURRENT_SEASON } from "@/lib/constants";

/* eslint-disable @typescript-eslint/no-explicit-any */
function StandingsTable({
  standings,
  conference,
}: {
  standings: any[];
  conference: Conference;
}) {
  return (
    <div className="glass-card overflow-hidden">
      <div className="px-5 py-4 border-b border-border-theme">
        <h3 className="text-lg text-heading">
          {conference}ern Conference
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border-theme bg-surface-alt">
              <th className="px-3 py-3 text-left text-xs uppercase tracking-wider text-text-muted w-8">
                #
              </th>
              <th className="px-3 py-3 text-left text-xs uppercase tracking-wider text-text-muted min-w-[160px]">
                Team
              </th>
              <th className="px-3 py-3 text-left text-xs uppercase tracking-wider text-text-muted">
                W
              </th>
              <th className="px-3 py-3 text-left text-xs uppercase tracking-wider text-text-muted">
                L
              </th>
              <th className="px-3 py-3 text-left text-xs uppercase tracking-wider text-text-muted">
                PCT
              </th>
              <th className="px-3 py-3 text-left text-xs uppercase tracking-wider text-text-muted">
                GB
              </th>
              <th className="px-3 py-3 text-left text-xs uppercase tracking-wider text-text-muted">
                Home
              </th>
              <th className="px-3 py-3 text-left text-xs uppercase tracking-wider text-text-muted">
                Away
              </th>
              <th className="px-3 py-3 text-left text-xs uppercase tracking-wider text-text-muted">
                L10
              </th>
              <th className="px-3 py-3 text-left text-xs uppercase tracking-wider text-text-muted">
                Strk
              </th>
              <th className="px-3 py-3 text-left text-xs uppercase tracking-wider text-text-muted">
                PPG
              </th>
              <th className="px-3 py-3 text-left text-xs uppercase tracking-wider text-text-muted">
                OPP
              </th>
              <th className="px-3 py-3 text-left text-xs uppercase tracking-wider text-text-muted">
                Diff
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-theme">
            {standings.map((s: any) => {
              const teamFullName = s.team.fullName ?? `${s.team.city ?? ""} ${s.team.nickname ?? s.team.name ?? ""}`.trim();
              return (
              <tr
                key={s.team.id}
                className={`hover:bg-lakers-purple/10 transition-colors ${
                  s.conferenceRank === 6
                    ? "border-b-2 border-lakers-gold/30"
                    : s.conferenceRank === 10
                      ? "border-b-2 border-red-500/30"
                      : ""
                }`}
              >
                <td className="px-3 py-3 font-mono text-sm text-text-faint">
                  {s.conferenceRank}
                  {(s.clinchIndicator ?? s.clinchStatus) && (
                    <span className="text-xs text-heading ml-0.5">
                      {s.clinchIndicator ?? s.clinchStatus}
                    </span>
                  )}
                </td>
                <td className="px-3 py-3">
                  <Link
                    href={`/teams/${s.team.id}`}
                    className="flex items-center gap-2 text-sm font-medium text-text-primary hover:text-heading transition-colors"
                  >
                    <TeamLogo
                      abbreviation={s.team.abbreviation}
                      primaryColor={s.team.primaryColor}
                      size="sm"
                    />
                    <span className="truncate">{teamFullName}</span>
                  </Link>
                </td>
                <td className="px-3 py-3 font-mono text-sm text-text-primary">
                  {s.wins}
                </td>
                <td className="px-3 py-3 font-mono text-sm text-text-primary">
                  {s.losses}
                </td>
                <td className="px-3 py-3 font-mono text-sm text-text-primary">
                  {(s.winPct * 100).toFixed(1)}
                </td>
                <td className="px-3 py-3 font-mono text-sm text-text-muted">
                  {s.gamesBehind !== null && s.gamesBehind !== undefined
                    ? s.gamesBehind === 0
                      ? "-"
                      : typeof s.gamesBehind === "number" ? s.gamesBehind.toFixed(1) : s.gamesBehind
                    : "-"}
                </td>
                <td className="px-3 py-3 font-mono text-sm text-text-secondary">
                  {s.home ?? `${s.homeWins ?? 0}-${s.homeLosses ?? 0}`}
                </td>
                <td className="px-3 py-3 font-mono text-sm text-text-secondary">
                  {s.away ?? `${s.awayWins ?? 0}-${s.awayLosses ?? 0}`}
                </td>
                <td className="px-3 py-3 font-mono text-sm text-text-secondary">
                  {s.lastTen ?? `${s.last10Wins ?? 0}-${s.last10Losses ?? 0}`}
                </td>
                <td className="px-3 py-3">
                  {s.streak ? (
                    <span
                      className={`font-mono text-sm font-medium ${
                        String(s.streak).startsWith("W")
                          ? "text-green-400"
                          : "text-red-400"
                      }`}
                    >
                      {s.streak}
                    </span>
                  ) : s.streakType && s.streakCount ? (
                    <span
                      className={`font-mono text-sm font-medium ${
                        s.streakType === "W"
                          ? "text-green-400"
                          : "text-red-400"
                      }`}
                    >
                      {s.streakType}
                      {s.streakCount}
                    </span>
                  ) : (
                    <span className="text-text-faint">-</span>
                  )}
                </td>
                <td className="px-3 py-3 font-mono text-sm text-text-primary">
                  {(s.pointsFor ?? s.pointsPerGame)?.toFixed(1) ?? "-"}
                </td>
                <td className="px-3 py-3 font-mono text-sm text-text-secondary">
                  {(s.pointsAgainst ?? s.opponentPPG)?.toFixed(1) ?? "-"}
                </td>
                <td
                  className={`px-3 py-3 font-mono text-sm font-medium ${
                    (s.pointDiff ?? 0) > 0
                      ? "text-green-400"
                      : (s.pointDiff ?? 0) < 0
                        ? "text-red-400"
                        : "text-text-muted"
                  }`}
                >
                  {s.pointDiff !== null && s.pointDiff !== undefined
                    ? `${s.pointDiff > 0 ? "+" : ""}${s.pointDiff.toFixed(1)}`
                    : "-"}
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {/* Legend */}
      <div className="px-5 py-3 border-t border-border-theme flex gap-6 text-xs text-text-faint">
        <span>
          <span className="inline-block w-3 h-0.5 bg-lakers-gold/50 mr-1 align-middle" />
          Playoff cutoff (Top 6)
        </span>
        <span>
          <span className="inline-block w-3 h-0.5 bg-red-500/50 mr-1 align-middle" />
          Play-In cutoff (7-10)
        </span>
      </div>
    </div>
  );
}

export default function StandingsPage() {
  const { data: standings, isLoading, error, refetch } = useStandings();

  if (isLoading) {
    return <PageSkeleton />;
  }

  if (error || !standings) {
    return (
      <ErrorDisplay
        title="Failed to load standings"
        message={error?.message ?? "Could not load standings data."}
        onRetry={() => refetch()}
      />
    );
  }

  // The API returns { season, asOfDate, east: [...], west: [...] }
  const standingsData = standings as any;
  const west = (standingsData.west ?? []).sort((a: any, b: any) => a.conferenceRank - b.conferenceRank);
  const east = (standingsData.east ?? []).sort((a: any, b: any) => a.conferenceRank - b.conferenceRank);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-heading mb-2">
          League Standings
        </h1>
        <p className="text-text-muted">{CURRENT_SEASON} Regular Season</p>
      </div>

      <div className="space-y-6">
        <StandingsTable standings={west} conference="West" />
        <StandingsTable standings={east} conference="East" />
      </div>
    </div>
  );
}

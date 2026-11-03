"use client";
import { Fragment, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { useAdvancedPlayers } from "@/lib/hooks/useAdvancedPlayers";
import { PLAYER_METRICS } from "@/lib/analytics/playerTrend";
import { SMALL_SAMPLE_GAMES } from "@/lib/analytics/projection";
import { PageSkeleton } from "@/components/ui/LoadingSkeleton";
import { ErrorDisplay } from "@/components/ui/ErrorDisplay";
import { StatCard } from "@/components/layout/StatCard";
import { fmtNum, fmtPct, fmtSigned, gameDay } from "@/lib/format";
import { TrendChart } from "./MetricTrendChart";
import { PlayerAvatar } from "./PlayerAvatar";
import { DataNotes, EmptyState, Section, SmallSampleTag, bestTrendGame, trendGameLabel } from "./primitives";
import type { AdvancedPlayerLine, AdvancedPlayersData, PlayerMetric } from "@/lib/dashboard-types";


const PLAYER_METRIC_META: Record<PlayerMetric, { label: string; short: string; fmt: "num" | "pct" | "signed"; help: string; lowerBetter?: boolean }> = {
  pts: { label: "Points", short: "PTS", fmt: "num", help: "Points per game" },
  min: { label: "Minutes", short: "MIN", fmt: "num", help: "Minutes per game" },
  tsPct: { label: "True shooting %", short: "TS%", fmt: "pct", help: "PTS ÷ (2 × (FGA + 0.44 × FTA)): scoring efficiency including threes and free throws" },
  efgPct: { label: "Effective FG%", short: "eFG%", fmt: "pct", help: "(FGM + 0.5 × 3PM) ÷ FGA: a three counts as 1.5 makes" },
  usgPct: { label: "Usage rate", short: "USG%", fmt: "pct", help: "Share of team plays used while on the floor — box-score estimate from the game's team totals" },
  threePaRate: { label: "3PA rate", short: "3PAr", fmt: "pct", help: "Share of shots that are threes (style, not quality)" },
  ftRate: { label: "FT rate", short: "FTr", fmt: "pct", help: "Free-throw attempts per field-goal attempt" },
  ast: { label: "Assists", short: "AST", fmt: "num", help: "Assists per game" },
  reb: { label: "Rebounds", short: "REB", fmt: "num", help: "Rebounds per game" },
  tov: { label: "Turnovers", short: "TOV", fmt: "num", help: "Turnovers per game", lowerBetter: true },
  plusMinus: { label: "Plus-minus", short: "+/-", fmt: "signed", help: "Point differential while on the floor, per game" },
};

function fmtPlayer(metric: PlayerMetric, v: number | null | undefined): string {
  switch (PLAYER_METRIC_META[metric].fmt) {
    case "pct": return fmtPct(v);
    case "signed": return fmtSigned(v);
    default: return fmtNum(v);
  }
}

/** Advanced Player Analytics: NBA.com season advanced lines, then any box-score metric game by game. */
export function AdvancedPlayerAnalytics() {
  const { data, isLoading, error, refetch } = useAdvancedPlayers();
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [metric, setMetric] = useState<PlayerMetric>("tsPct");

  if (isLoading) return <PageSkeleton />;
  if (error || !data) {
    return <ErrorDisplay title="Player analytics unavailable" message={error?.message ?? "Could not load player analytics."} onRetry={() => refetch()} />;
  }

  const played = data.players.filter((p) => p.gamesPlayed > 0);
  const player = played.find((p) => p.playerId === playerId) ?? played[0] ?? null;
  const notes: string[] = [];
  if (data.season.isDemo) notes.push("Demo data — not real stats.");

  return (
    <div className="space-y-6">
      <DataNotes notes={notes} />
      <div>
        <p className="text-xs uppercase tracking-wider text-text-faint">{data.season.displayName} · {data.team.name}</p>
        <h1 className="text-3xl font-bold text-heading">Advanced Player Analytics</h1>
      </div>
      {player ? (
        <>
          <PlayerTrendSection data={data} player={player} metric={metric} onMetric={setMetric} />
          <RosterTable players={played} selected={player.playerId} onSelect={setPlayerId} />
        </>
      ) : (
        <Section title="Players"><EmptyState>No player has played a game yet this season.</EmptyState></Section>
      )}
    </div>
  );
}

function PlayerTrendSection({ data, player, metric, onMetric }: {
  data: AdvancedPlayersData;
  player: AdvancedPlayerLine;
  metric: PlayerMetric;
  onMetric: (m: PlayerMetric) => void;
}) {
  const meta = PLAYER_METRIC_META[metric];
  const games = player.games;
  const last = games[games.length - 1];
  const season = last?.toDate[metric] ?? null;
  const best = bestTrendGame(games, metric, !!meta.lowerBetter);
  const small = games.length < SMALL_SAMPLE_GAMES;
  const rows = games.map((g) => ({
    key: g.gameId,
    label: `${format(gameDay(g.date), "MMM d")} ${g.opponentAbbr}`,
    result: g.result,
    game: g.game[metric],
    rolling: g.rolling[metric],
  }));

  const picker = (
    <label className="flex flex-col gap-1 text-xs text-text-muted">
      Metric
      <select
        value={metric}
        onChange={(e) => onMetric(e.target.value as PlayerMetric)}
        className="bg-input border border-border-theme rounded-lg px-3 py-2 text-sm text-text-primary min-w-48"
      >
        {PLAYER_METRICS.map((m) => <option key={m} value={m}>{PLAYER_METRIC_META[m].label}</option>)}
      </select>
    </label>
  );

  return (
    <Section
      title={`${player.name}: ${meta.label.toLowerCase()}, game by game`}
      subtitle={
        <>
          {meta.help}. Each game, {data.rollingWindow}-game average (gold) and season to date (dashed), from box scores.
          {meta.lowerBetter && <span className="ml-2 rounded bg-input px-1.5 py-0.5 text-[10px] uppercase tracking-wide">lower is better</span>}
          {small && <SmallSampleTag className="ml-2" />}
        </>
      }
      action={picker}
    >
      {games.length ? (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <StatCard label="Season" value={fmtPlayer(metric, season)} subtitle={`${games.length} game${games.length === 1 ? "" : "s"}`} />
            <StatCard label={`Last ${data.rollingWindow} games`} value={fmtPlayer(metric, last.rolling[metric])} subtitle="Totals over the window" />
            <StatCard label="Last game" value={fmtPlayer(metric, last.game[metric])} subtitle={trendGameLabel(last)} />
            <StatCard label="Best game" value={best ? fmtPlayer(metric, best.game[metric]) : "—"} subtitle={best ? trendGameLabel(best) : "—"} />
          </div>
          <TrendChart
            rows={rows}
            label={meta.short}
            fmt={(v) => fmtPlayer(metric, v)}
            season={season}
            seasonLabel={`Season ${fmtPlayer(metric, season)}`}
            rollingWindow={data.rollingWindow}
          />
        </>
      ) : (
        <EmptyState>No box scores for {player.name} yet.</EmptyState>
      )}
    </Section>
  );
}

const ROSTER_COLUMNS: { key: string; title: string; value: (p: AdvancedPlayerLine) => string }[] = [
  { key: "GP", title: "Games played", value: (p) => String(p.gamesPlayed) },
  { key: "MIN", title: "Minutes per game", value: (p) => fmtNum(p.minutesPerGame) },
  { key: "PTS", title: "Points per game", value: (p) => fmtNum(p.pointsPerGame) },
  { key: "USG%", title: "Usage rate: share of team plays used on the floor", value: (p) => fmtPct(p.usageRate) },
  { key: "TS%", title: "True shooting %", value: (p) => fmtPct(p.trueShootingPct) },
  { key: "eFG%", title: "Effective FG%", value: (p) => fmtPct(p.effectiveFgPct) },
  { key: "AST%", title: "Share of teammates' baskets assisted while on the floor", value: (p) => fmtPct(p.assistPct) },
  { key: "REB%", title: "Share of available rebounds grabbed while on the floor", value: (p) => fmtPct(p.reboundPct) },
  { key: "ORTG", title: "Points produced per 100 possessions on the floor", value: (p) => fmtNum(p.offRating) },
  { key: "DRTG", title: "Points allowed per 100 possessions on the floor (lower is better)", value: (p) => fmtNum(p.defRating) },
  { key: "NET", title: "ORTG − DRTG", value: (p) => fmtSigned(p.netRating) },
  { key: "PIE", title: "Player Impact Estimate (NBA.com): share of game events — not PER", value: (p) => fmtPct(p.pie) },
  { key: "+/-", title: "Plus-minus per game", value: (p) => fmtSigned(p.plusMinusPerGame) },
];

function RosterTable({ players, selected, onSelect }: { players: AdvancedPlayerLine[]; selected: string; onSelect: (id: string) => void }) {
  return (
    <Section title="Season advanced stats" subtitle="NBA.com advanced numbers · select a player to chart them">
      <div className="relative overflow-x-auto">
        <table className="w-full text-sm whitespace-nowrap">
          <thead>
            <tr className="text-xs uppercase tracking-wider text-text-muted border-b border-border-theme">
              <th className="text-left py-2 font-medium">Player</th>
              {ROSTER_COLUMNS.map((c) => <th key={c.key} title={c.title} className="text-right py-2 px-1.5 font-medium">{c.key}</th>)}
            </tr>
          </thead>
          <tbody>
            {players.map((p) => (
              <Fragment key={p.playerId}>
              <tr
                onClick={() => onSelect(p.playerId)}
                aria-selected={p.playerId === selected}
                className={`border-b border-border-theme/50 cursor-pointer transition-colors ${p.playerId === selected ? "bg-lakers-purple/15" : "hover:bg-input"}`}
              >
                <td className="py-1.5 pr-2">
                  <span className="flex items-center gap-2">
                    <PlayerAvatar name={p.name} headshotUrl={p.headshotUrl} size={24} />
                    <button type="button" className="text-left text-text-primary">{p.name}</button>
                    {p.position && <span className="text-[10px] text-text-faint">{p.position}</span>}
                    {p.gamesPlayed < SMALL_SAMPLE_GAMES && <SmallSampleTag />}
                    <Link href={`/players/${p.playerId}`} onClick={(e) => e.stopPropagation()} className="text-[10px] text-text-faint hover:text-heading" title={`${p.name}'s player page`}>↗</Link>
                  </span>
                </td>
                {ROSTER_COLUMNS.map((c) => (
                  <td key={c.key} className="py-1.5 px-1.5 text-right font-mono text-text-secondary">{c.value(p)}</td>
                ))}
              </tr>
              {p.gamesPlayed < SMALL_SAMPLE_GAMES && (
                <tr className="border-b border-border-theme/50">
                  <td colSpan={ROSTER_COLUMNS.length + 1} className="pb-1.5 pl-8 text-xs text-text-faint whitespace-normal">
                    {p.previous
                      ? `Baseline, ${p.previous.season}${p.previous.teamAbbr ? ` (${p.previous.teamAbbr})` : ""}: ${p.previous.gamesPlayed} GP · ${fmtNum(p.previous.pointsPerGame)} PTS · ${fmtPct(p.previous.usageRate)} USG · ${fmtPct(p.previous.trueShootingPct)} TS · ${fmtSigned(p.previous.netRating)} NET`
                      : "No previous-season NBA line to compare against (rookie or didn't play)."}
                  </td>
                </tr>
              )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

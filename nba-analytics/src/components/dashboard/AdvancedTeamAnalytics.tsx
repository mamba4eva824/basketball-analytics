"use client";
import { useState } from "react";
import { format } from "date-fns";
import { useAdvancedTeam } from "@/lib/hooks/useAdvancedTeam";
import { METRIC_DIRECTION, RANKED_METRICS, STYLE_METRICS } from "@/lib/analytics/ranks";
import { PageSkeleton } from "@/components/ui/LoadingSkeleton";
import { ErrorDisplay } from "@/components/ui/ErrorDisplay";
import { StatCard } from "@/components/layout/StatCard";
import { gameDay, ordinal } from "@/lib/format";
import { MetricTrendChart } from "./MetricTrendChart";
import { DataNotes, EmptyState, METRIC_META, RankChip, Section, SmallSampleTag, fmtMetric } from "./primitives";
import type { AdvancedTeamData, MetricTrendPointView, RankedMetric } from "@/lib/dashboard-types";

const SMALL_SAMPLE_GAMES = 5;

// Derived from RANKED_METRICS so a newly ranked metric shows up here automatically
const RATINGS: RankedMetric[] = ["netRtg", "offRtg", "defRtg", "pace"];
const GROUPS: { label: string; metrics: RankedMetric[] }[] = [
  { label: "Ratings", metrics: RATINGS },
  { label: "Offense", metrics: RANKED_METRICS.filter((m) => !RATINGS.includes(m) && !m.startsWith("opp")) },
  { label: "Defense", metrics: RANKED_METRICS.filter((m) => m.startsWith("opp")) },
];

/** Advanced Team Analytics: any team metric game by game, with a rolling average and the season rate. */
export function AdvancedTeamAnalytics() {
  const { data, isLoading, error, refetch } = useAdvancedTeam();
  const [metric, setMetric] = useState<RankedMetric>("tovPct");

  if (isLoading) return <PageSkeleton />;
  if (error || !data) {
    return <ErrorDisplay title="Advanced analytics unavailable" message={error?.message ?? "Could not load team analytics."} onRetry={() => refetch()} />;
  }

  const notes: string[] = [];
  if (data.season.isDemo) notes.push("Demo data — not real stats.");
  const small = data.games.length < SMALL_SAMPLE_GAMES;
  if (small && data.games.length) notes.push(`Only ${data.games.length} games played — the ${data.rollingWindow}-game average equals the season to date until game ${data.rollingWindow}.`);

  return (
    <div className="space-y-6">
      <DataNotes notes={notes} />
      <div>
        <p className="text-xs uppercase tracking-wider text-text-faint">{data.season.displayName} · {data.team.name}</p>
        <h1 className="text-3xl font-bold text-heading">Advanced Team Analytics</h1>
      </div>

      {data.games.length ? (
        <>
          <TrendSection data={data} metric={metric} onMetric={setMetric} small={small} />
          <MetricTable data={data} selected={metric} onSelect={setMetric} />
        </>
      ) : (
        <Section title="Game-by-game trend"><EmptyState>No games yet this season.</EmptyState></Section>
      )}
    </div>
  );
}

function TrendSection({ data, metric, onMetric, small }: {
  data: AdvancedTeamData;
  metric: RankedMetric;
  onMetric: (m: RankedMetric) => void;
  small: boolean;
}) {
  const meta = METRIC_META[metric];
  const style = STYLE_METRICS.has(metric);
  const lowerBetter = !style && METRIC_DIRECTION[metric] === "lower";
  const season = data.seasonMetrics[metric];
  const last = data.games[data.games.length - 1];
  const best = bestGame(data.games, metric, lowerBetter);

  const picker = (
    <label className="flex flex-col gap-1 text-xs text-text-muted">
      Metric
      <select
        value={metric}
        onChange={(e) => onMetric(e.target.value as RankedMetric)}
        className="bg-input border border-border-theme rounded-lg px-3 py-2 text-sm text-text-primary min-w-56"
      >
        {GROUPS.map((g) => (
          <optgroup key={g.label} label={g.label}>
            {g.metrics.map((m) => <option key={m} value={m}>{METRIC_META[m].label}</option>)}
          </optgroup>
        ))}
      </select>
    </label>
  );

  return (
    <Section
      title={`${meta.label}, game by game`}
      subtitle={
        <>
          {meta.help}. Curve through each game, {data.rollingWindow}-game average (gold) and season rate (dashed).
          {lowerBetter && <span className="ml-2 rounded bg-input px-1.5 py-0.5 text-[10px] uppercase tracking-wide">lower is better</span>}
          {style && <span className="ml-2 rounded bg-input px-1.5 py-0.5 text-[10px] uppercase tracking-wide" title="Playing style — neither higher nor lower is better">style</span>}
          {small && <SmallSampleTag className="ml-2" />}
        </>
      }
      action={picker}
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <StatCard
          label="Season"
          value={fmtMetric(metric, season.value)}
          subtitle={season.rank != null ? `${ordinal(season.rank)} of ${data.rankedTeams} teams` : "Not ranked"}
          title={`${meta.help} · box-score estimate`}
        />
        <StatCard label={`Last ${data.rollingWindow} games`} value={fmtMetric(metric, last.rolling[metric])} subtitle="Totals over the window" />
        <StatCard label="Last game" value={fmtMetric(metric, last.game[metric])} subtitle={gameLabel(last)} />
        <StatCard label={style ? "Highest game" : "Best game"} value={best ? fmtMetric(metric, best.game[metric]) : "—"} subtitle={best ? gameLabel(best) : "—"} />
      </div>
      <MetricTrendChart metric={metric} games={data.games} season={season} rollingWindow={data.rollingWindow} rankedTeams={data.rankedTeams} />
    </Section>
  );
}

function gameLabel(g: MetricTrendPointView): string {
  return `${g.result} vs ${g.opponentAbbr} · ${format(gameDay(g.date), "MMM d")}`;
}

function bestGame(games: MetricTrendPointView[], metric: RankedMetric, lowerBetter: boolean): MetricTrendPointView | null {
  let best: MetricTrendPointView | null = null;
  for (const g of games) {
    const v = g.game[metric];
    if (v == null) continue;
    const b = best?.game[metric];
    if (b == null || (lowerBetter ? v < b : v > b)) best = g;
  }
  return best;
}

function MetricTable({ data, selected, onSelect }: { data: AdvancedTeamData; selected: RankedMetric; onSelect: (m: RankedMetric) => void }) {
  const last = data.games[data.games.length - 1];
  return (
    <Section title="All metrics" subtitle="Select a row to chart it">
      <div className="relative overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wider text-text-muted border-b border-border-theme">
              <th className="text-left py-2 font-medium">Metric</th>
              <th className="text-right py-2 px-2 font-medium">Season</th>
              <th className="text-right py-2 px-2 font-medium">Rank</th>
              <th className="text-right py-2 px-2 font-medium">Last {data.rollingWindow}</th>
              <th className="text-right py-2 pl-2 font-medium">Last game</th>
            </tr>
          </thead>
          {GROUPS.map((g) => (
            <tbody key={g.label}>
              <tr><td colSpan={5} className="pt-3 pb-1 text-[10px] uppercase tracking-wider text-text-faint">{g.label}</td></tr>
              {g.metrics.map((m) => (
                <tr
                  key={m}
                  onClick={() => onSelect(m)}
                  aria-selected={m === selected}
                  className={`border-b border-border-theme/50 cursor-pointer transition-colors ${m === selected ? "bg-lakers-purple/15" : "hover:bg-input"}`}
                >
                  <td className="py-1.5">
                    <button type="button" className="text-left text-text-primary" title={METRIC_META[m].help}>{METRIC_META[m].label}</button>
                  </td>
                  <td className="py-1.5 px-2 text-right font-mono text-text-primary">{fmtMetric(m, data.seasonMetrics[m].value)}</td>
                  <td className="py-1.5 px-2 text-right"><RankChip rank={data.seasonMetrics[m].rank} of={data.rankedTeams} /></td>
                  <td className="py-1.5 px-2 text-right font-mono text-text-secondary">{fmtMetric(m, last.rolling[m])}</td>
                  <td className="py-1.5 pl-2 text-right font-mono text-text-secondary">{fmtMetric(m, last.game[m])}</td>
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
    </Section>
  );
}

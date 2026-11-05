"use client";
import { useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { CartesianGrid, Legend, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useSeasonProgress } from "@/lib/hooks/useSeasonProgress";
import { useFocusMetrics } from "@/lib/hooks/useFocusMetrics";
import { useThemeColors } from "@/lib/ThemeContext";
import { gameDay, ordinal } from "@/lib/format";
import { RANKED_METRICS, STYLE_METRICS, type RankedMetric } from "@/lib/analytics/ranks";
import type { FocusCard, MetricStanding, TrendVerdict } from "@/lib/analytics/seasonProgress";
import { PageSkeleton } from "@/components/ui/LoadingSkeleton";
import { ErrorDisplay } from "@/components/ui/ErrorDisplay";
import { DataNotes, EmptyState, METRIC_META, RankChip, Section, SmallSampleTag, fmtMetric } from "./primitives";
import type { ProgressPointView, SeasonProgressData, SegmentView } from "@/lib/dashboard-types";

/**
 * /progress — Season progress: the focus areas the team is working on, tracked game by game.
 * Pinned metrics live in this browser (default: TOV%, OREB%, opp OREB%, DRtg, net rating).
 */
export function SeasonProgress() {
  const q = useSeasonProgress();
  const focus = useFocusMetrics(q.data?.focusDefault ?? []);
  if (q.isLoading) return <PageSkeleton />;
  if (q.isError || !q.data) return <ErrorDisplay title="Season progress unavailable" message={(q.error as Error | null)?.message} onRetry={() => q.refetch()} />;
  const data = q.data;
  const pinned = focus.metrics;

  if (!data.games) {
    return (
      <div className="space-y-6">
        <DataNotes notes={data.dataNotes} />
        <Section title="Season progress"><EmptyState>No games yet this season.</EmptyState></Section>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <DataNotes notes={data.dataNotes} />
      <div>
        <h1 className="text-2xl text-heading">Season progress</h1>
        <p className="text-sm text-text-muted">
          {`${data.team.name}, ${data.season.displayName}: ${data.games} game${data.games === 1 ? "" : "s"}.`}{" "}Is the team getting better at what it&apos;s working on?
        </p>
      </div>

      <Section title="Focus areas" subtitle="Pin the metrics you're tracking — saved in this browser" action={<FocusPicker pinned={pinned} isDefault={focus.isDefault} onChange={focus.setMetrics} onReset={focus.reset} />}>
        <FocusScorecard data={data} metrics={pinned} />
      </Section>

      <Section title="League rank, game by game" subtitle={`Rank of the season-to-date value after each game, among ${data.rankedTeams} teams on that day (1 = best). Shaded: top and bottom third.`}>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {pinned.map((m) => <RankChart key={m} metric={m} history={data.history} teams={data.rankedTeams} />)}
        </div>
      </Section>

      <ValueSection data={data} pinned={pinned} />

      <Segments data={data} pinned={pinned} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Section title="Strengths and weaknesses" subtitle={`Top and bottom third of the league today, every quality metric (not pace, 3PA rate or raw points)`}>
          <StandingList title="Strengths" items={data.strengths} teams={data.rankedTeams} empty="No metric in the top third yet." />
          <StandingList title="Weaknesses" items={data.weaknesses} teams={data.rankedTeams} empty="No metric in the bottom third." className="mt-4" />
        </Section>
        <Section
          title="Movers"
          subtitle={data.moversSince ? `League rank now vs after game ${data.moversSince} — 3+ places` : "Shows once we are past the first 5 games (small sample)"}
        >
          <StandingList title="Rising" items={data.risers} teams={data.rankedTeams} empty="No metric up 3+ places." showChange />
          <StandingList title="Falling" items={data.fallers} teams={data.rankedTeams} empty="No metric down 3+ places." showChange className="mt-4" />
        </Section>
      </div>

      <DataNotes notes={[
        `Every value is a box-score profile (totals first, then divide), the same math as the season ranks. League average pools every game played through that day.`,
        `"Improving / slipping" compares the last ${data.recentGames} games with the season, past a minimum change per metric (1 pt for percentages, 2 for ratings); smaller gaps read "steady".`,
      ]} />
    </div>
  );
}

// ── Scorecard (also on the dashboard) ───────────────────────────────────────

const TREND_STYLE: Record<NonNullable<TrendVerdict>, { text: string; cls: string }> = {
  improving: { text: "▲ improving", cls: "text-emerald-600 dark:text-emerald-400" },
  slipping: { text: "▼ slipping", cls: "text-red-600 dark:text-red-400" },
  steady: { text: "■ steady", cls: "text-text-muted" },
};

export function FocusScorecard({ data, metrics }: { data: SeasonProgressData; metrics: RankedMetric[] }) {
  const small = data.games < 5;
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
      {metrics.map((m) => <FocusTile key={m} card={data.cards[m]} teams={data.rankedTeams} recentGames={data.recentGames} small={small} />)}
    </div>
  );
}

function FocusTile({ card, teams, recentGames, small }: { card: FocusCard; teams: number; recentGames: number; small: boolean }) {
  const meta = METRIC_META[card.metric];
  const t = card.trend ? TREND_STYLE[card.trend] : null;
  return (
    <div className="glass-card stat-card p-4" title={meta.help}>
      <p className="text-xs uppercase tracking-wider text-text-muted">{meta.label}</p>
      <div className="flex items-baseline gap-2 mt-1">
        <p className="text-2xl font-bold font-mono text-text-primary">{fmtMetric(card.metric, card.season)}</p>
        <RankChip rank={card.rank} of={teams} />
      </div>
      <dl className="mt-2 space-y-0.5 text-xs">
        <div className="flex justify-between gap-2">
          <dt className="text-text-muted whitespace-nowrap">Last {recentGames}</dt>
          <dd className="font-mono text-text-secondary">{fmtMetric(card.metric, card.recent)} {card.recentRank != null && <span className="text-text-faint">({ordinal(card.recentRank)})</span>}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-text-muted">League avg</dt>
          <dd className="font-mono text-text-secondary">{fmtMetric(card.metric, card.league)}</dd>
        </div>
      </dl>
      <p className="mt-2 flex flex-wrap items-center gap-x-2 text-xs">
        {t ? <span className={t.cls} title={`Last ${recentGames} games vs season`}>{t.text}</span> : <span className="text-text-faint">style metric</span>}
        {card.rankChange != null && card.rankChange !== 0 && (
          <span className={card.rankChange > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"} title="League places gained or lost since the movers baseline">
            {`${card.rankChange > 0 ? "+" : ""}${card.rankChange} place${Math.abs(card.rankChange) === 1 ? "" : "s"}`}
          </span>
        )}
        {small && <SmallSampleTag />}
      </p>
    </div>
  );
}

/** Dashboard version: the pinned scorecard with a link to the full page. */
export function DashboardFocusScorecard() {
  const q = useSeasonProgress();
  const focus = useFocusMetrics(q.data?.focusDefault ?? []);
  if (!q.data || !q.data.games) return null;
  return (
    <Section
      title="Focus areas"
      subtitle={`What the team is working on: season, last ${q.data.recentGames} games and league rank`}
      action={<Link href="/progress" className="text-sm text-lakers-purple-light hover:text-heading">Season progress →</Link>}
    >
      <FocusScorecard data={q.data} metrics={focus.metrics} />
    </Section>
  );
}

function FocusPicker({ pinned, isDefault, onChange, onReset }: {
  pinned: RankedMetric[];
  isDefault: boolean;
  onChange: (m: RankedMetric[]) => void;
  onReset: () => void;
}) {
  const available = RANKED_METRICS.filter((m) => !pinned.includes(m));
  return (
    <div className="flex flex-wrap items-center gap-2">
      {pinned.map((m) => (
        <span key={m} className="inline-flex items-center gap-1 rounded-full border border-border-theme px-2 py-0.5 text-xs text-text-primary">
          {METRIC_META[m].short}
          <button
            type="button"
            aria-label={`Unpin ${METRIC_META[m].label}`}
            title="Unpin"
            disabled={pinned.length === 1}
            onClick={() => onChange(pinned.filter((x) => x !== m))}
            className="text-text-muted hover:text-text-primary disabled:opacity-30"
          >
            ✕
          </button>
        </span>
      ))}
      {available.length > 0 && (
        <select
          aria-label="Pin a metric"
          value=""
          onChange={(e) => e.target.value && onChange([...pinned, e.target.value as RankedMetric])}
          className="rounded-md border border-border-theme bg-input px-2 py-1 text-xs text-text-primary"
        >
          <option value="">+ Pin a metric</option>
          {available.map((m) => <option key={m} value={m}>{METRIC_META[m].label}</option>)}
        </select>
      )}
      {!isDefault && (
        <button type="button" onClick={onReset} className="text-xs text-text-muted hover:text-text-primary underline">
          Reset
        </button>
      )}
    </div>
  );
}

// ── Charts ───────────────────────────────────────────────────────────────────

const pointLabel = (p: ProgressPointView) => `G${p.gameNo} ${p.won ? "W" : "L"} ${p.opponentAbbr} · ${format(gameDay(p.date), "MMM d")}`;

function RankChart({ metric, history, teams }: { metric: RankedMetric; history: ProgressPointView[]; teams: number }) {
  const c = useThemeColors();
  const rows = history.map((p) => ({ x: p.gameNo, rank: p.rank[metric], value: p.toDate[metric], label: pointLabel(p), of: p.rankedTeams }));
  const last = history[history.length - 1];
  const third = Math.ceil(teams / 3);
  const style = STYLE_METRICS.has(metric);
  return (
    <div className="rounded-lg border border-border-theme/60 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-heading">{METRIC_META[metric].label}</p>
        <p className="text-xs text-text-muted">
          now <RankChip rank={last.rank[metric]} of={teams} /> · {fmtMetric(metric, last.toDate[metric])}
        </p>
      </div>
      <ResponsiveContainer width="100%" height={150}>
        <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
          {!style && <ReferenceArea y1={1} y2={third} fill={c.us} fillOpacity={0.07} ifOverflow="hidden" />}
          {!style && <ReferenceArea y1={teams - third + 1} y2={teams} fill={c.them} fillOpacity={0.07} ifOverflow="hidden" />}
          <CartesianGrid vertical={false} stroke={c.grid} />
          <XAxis dataKey="x" tick={{ fill: c.tick, fontSize: 10 }} tickLine={false} axisLine={{ stroke: c.axis }} minTickGap={16} />
          <YAxis reversed domain={[1, teams]} ticks={[1, Math.round(teams / 2), teams]} tick={{ fill: c.tick, fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
          <Tooltip
            content={({ active, payload }) => {
              const p = payload?.[0]?.payload as (typeof rows)[number] | undefined;
              if (!active || !p) return null;
              return (
                <div style={{ backgroundColor: c.tooltipBg, border: `1px solid ${c.tooltipBorder}`, borderRadius: 8, fontSize: 12, padding: "6px 8px" }}>
                  <p style={{ color: c.tooltipLabel, fontWeight: 600 }}>{p.label}</p>
                  <p style={{ color: c.labelText }}>{p.rank != null ? `${ordinal(p.rank)} of ${p.of}` : "—"} · season {fmtMetric(metric, p.value)}</p>
                </div>
              );
            }}
          />
          <Line dataKey="rank" type="stepAfter" stroke={c.us} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function ValueSection({ data, pinned }: { data: SeasonProgressData; pinned: RankedMetric[] }) {
  const [picked, setPicked] = useState<RankedMetric | null>(null);
  const metric = picked && pinned.includes(picked) ? picked : pinned[0];
  const c = useThemeColors();
  const rows = data.history.map((p) => ({ x: p.gameNo, label: pointLabel(p), season: p.toDate[metric], recent: p.recent[metric], league: p.league[metric] }));
  return (
    <Section
      title="Value over the season"
      subtitle={`Season to date, last ${data.recentGames} games and the league average after each game`}
      action={
        <div role="tablist" aria-label="Metric" className="flex flex-wrap gap-1">
          {pinned.map((m) => (
            <button key={m} role="tab" aria-selected={m === metric} onClick={() => setPicked(m)}
              className={`rounded-md px-2.5 py-1 text-xs ${m === metric ? "bg-lakers-purple text-white" : "border border-border-theme text-text-muted hover:text-text-primary"}`}>
              {METRIC_META[m].short}
            </button>
          ))}
        </div>
      }
    >
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke={c.grid} />
          <XAxis dataKey="x" tick={{ fill: c.tick, fontSize: 11 }} tickLine={false} axisLine={{ stroke: c.axis }} label={{ value: "Game", position: "insideBottomRight", offset: -2, fill: c.tick, fontSize: 11 }} />
          <YAxis domain={["auto", "auto"]} tick={{ fill: c.tick, fontSize: 11 }} tickLine={false} axisLine={false} width={56} tickFormatter={(v: number) => fmtMetric(metric, v)} />
          <Tooltip
            content={({ active, payload }) => {
              const p = payload?.[0]?.payload as (typeof rows)[number] | undefined;
              if (!active || !p) return null;
              return (
                <div style={{ backgroundColor: c.tooltipBg, border: `1px solid ${c.tooltipBorder}`, borderRadius: 8, fontSize: 12, padding: "6px 8px" }}>
                  <p style={{ color: c.tooltipLabel, fontWeight: 600 }}>{p.label}</p>
                  <p style={{ color: c.labelText }}>Season to date: {fmtMetric(metric, p.season)}</p>
                  <p style={{ color: c.labelText }}>Last {data.recentGames}: {fmtMetric(metric, p.recent)}</p>
                  <p style={{ color: c.labelText }}>League: {fmtMetric(metric, p.league)}</p>
                </div>
              );
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
          <Line dataKey="season" name="Season to date" type="monotone" stroke={c.us} strokeWidth={2.5} dot={false} isAnimationActive={false} />
          <Line dataKey="recent" name={`Last ${data.recentGames} games`} type="monotone" stroke={c.trend} strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line dataKey="league" name="League average" type="monotone" stroke={c.tick} strokeWidth={1.5} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
      <p className="text-xs text-text-muted mt-2">{METRIC_META[metric].help}</p>
    </Section>
  );
}

// ── Splits ───────────────────────────────────────────────────────────────────

function Segments({ data, pinned }: { data: SeasonProgressData; pinned: RankedMetric[] }) {
  const [by, setBy] = useState<"blocks" | "months">("blocks");
  const rows: SegmentView[] = by === "blocks" ? data.blocks : data.months;
  return (
    <Section
      title="Season splits"
      subtitle={`Each stretch's value, league rank over the same dates, and the league average below it`}
      action={
        <div role="tablist" aria-label="Split by" className="inline-flex gap-1 rounded-lg border border-border-theme p-1">
          {([["blocks", `${data.segmentGames}-game blocks`], ["months", "Months"]] as const).map(([k, label]) => (
            <button key={k} role="tab" aria-selected={by === k} onClick={() => setBy(k)}
              className={`rounded-md px-2.5 py-1 text-xs ${by === k ? "bg-lakers-purple text-white" : "text-text-muted hover:text-text-primary"}`}>
              {label}
            </button>
          ))}
        </div>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[560px]">
          <thead>
            <tr className="text-xs uppercase tracking-wider text-text-muted border-b border-border-theme">
              <th className="text-left font-medium py-2 pr-2">Stretch</th>
              <th className="text-right font-medium py-2 px-2">W-L</th>
              {pinned.map((m) => <th key={m} className="text-right font-medium py-2 px-2" title={METRIC_META[m].help}>{METRIC_META[m].short}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.label} className="border-b border-border-theme/50 last:border-0 align-top">
                <td className="py-2 pr-2">
                  <p className="text-text-primary">{s.label}</p>
                  <p className="text-[11px] text-text-muted">{format(gameDay(s.from), "MMM d")} – {format(gameDay(s.to), "MMM d")}{s.smallSample && <SmallSampleTag className="ml-1" />}</p>
                </td>
                <td className="py-2 px-2 text-right font-mono text-text-secondary">{s.wins}-{s.games - s.wins}</td>
                {pinned.map((m) => (
                  <td key={m} className="py-2 px-2 text-right">
                    <p className="font-mono text-text-primary">{fmtMetric(m, s.values[m])} <RankChip rank={s.rank[m]} of={data.rankedTeams} /></p>
                    <p className="font-mono text-[11px] text-text-faint" title="League average over the same dates">lg {fmtMetric(m, s.league[m])}</p>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

function StandingList({ title, items, teams, empty, showChange, className = "" }: {
  title: string;
  items: MetricStanding[];
  teams: number;
  empty: string;
  showChange?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-xs uppercase tracking-wider text-text-muted mb-1.5">{title}</p>
      {items.length === 0 ? (
        <p className="text-sm text-text-muted">{empty}</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {items.map((s) => (
            <li key={s.metric} className="flex justify-between gap-3">
              <span className="text-text-primary">{METRIC_META[s.metric].label}</span>
              <span className="font-mono text-text-secondary text-xs">
                {fmtMetric(s.metric, s.value)} · <RankChip rank={s.rank} of={teams} />
                {showChange && s.change != null && (
                  <span className={s.change > 0 ? "ml-1 text-emerald-600 dark:text-emerald-400" : "ml-1 text-red-600 dark:text-red-400"}>
                    ({s.change > 0 ? `+${s.change}` : s.change})
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

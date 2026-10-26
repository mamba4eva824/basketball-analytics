"use client";
import type { ReactNode } from "react";
import { fmtNum, fmtPct, fmtSigned, gameDay, ordinal, rankTone } from "@/lib/format";
import type { GameResultView, InjuryView, MetricWithRank, RankedMetric, RosterStatus, Trend } from "@/lib/dashboard-types";

// ── Metric metadata (labels + formatting live here, nowhere else) ───────────

type Fmt = "pct" | "rtg" | "signed" | "num";

export const METRIC_META: Record<RankedMetric, { label: string; short: string; fmt: Fmt; help: string }> = {
  netRtg: { label: "Net Rating", short: "NET", fmt: "signed", help: "ORtg − DRtg: point differential per 100 possessions" },
  offRtg: { label: "Offensive Rating", short: "ORTG", fmt: "rtg", help: "Points scored per 100 possessions" },
  defRtg: { label: "Defensive Rating", short: "DRTG", fmt: "rtg", help: "Points allowed per 100 possessions (lower is better)" },
  pace: { label: "Pace", short: "PACE", fmt: "rtg", help: "Possessions per game" },
  efgPct: { label: "eFG%", short: "eFG%", fmt: "pct", help: "(FGM + 0.5·3PM) / FGA" },
  tovPct: { label: "Turnover %", short: "TOV%", fmt: "pct", help: "Turnovers per play (lower is better)" },
  orebPct: { label: "Off. Rebound %", short: "OREB%", fmt: "pct", help: "Share of own misses rebounded" },
  ftRate: { label: "FTA Rate", short: "FTr", fmt: "pct", help: "Free-throw attempts per FGA" },
  threePaRate: { label: "3PA Rate", short: "3PAr", fmt: "pct", help: "Share of shots that are threes" },
  threePct: { label: "3P%", short: "3P%", fmt: "pct", help: "Three-point percentage" },
  oppEfgPct: { label: "Opp eFG%", short: "oeFG%", fmt: "pct", help: "Opponent shooting allowed (lower is better)" },
  oppTovPct: { label: "Opp Turnover %", short: "oTOV%", fmt: "pct", help: "Turnovers forced per opponent play" },
  oppOrebPct: { label: "Opp Off. Reb %", short: "oOREB%", fmt: "pct", help: "Opponent offensive rebounds allowed (lower is better)" },
  oppFtRate: { label: "Opp FTA Rate", short: "oFTr", fmt: "pct", help: "Opponent free throws allowed (lower is better)" },
  oppThreePct: { label: "Opp 3P%", short: "o3P%", fmt: "pct", help: "Opponent three-point % allowed" },
  ppg: { label: "Points / game", short: "PPG", fmt: "num", help: "Points scored per game" },
  oppPpg: { label: "Opp points / game", short: "OPPG", fmt: "num", help: "Points allowed per game" },
};

export function fmtMetric(metric: RankedMetric, value: number | null | undefined): string {
  switch (METRIC_META[metric].fmt) {
    case "pct": return fmtPct(value);
    case "signed": return fmtSigned(value);
    default: return fmtNum(value);
  }
}

// ── Layout ───────────────────────────────────────────────────────────────────

export function Section({ title, subtitle, action, children, className = "" }: {
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`glass-card p-4 md:p-6 min-w-0 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-2 mb-4">
        <div className="min-w-0">
          <h3 className="text-lg text-heading">{title}</h3>
          {subtitle && <p className="text-xs text-text-muted mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="text-sm text-text-muted py-6 text-center">{children}</p>;
}

export function DataNotes({ notes }: { notes: string[] }) {
  if (!notes.length) return null;
  return (
    <div role="status" className="rounded-lg border border-lakers-gold/40 bg-lakers-gold/10 px-4 py-3 text-sm text-text-secondary space-y-1">
      {notes.map((n) => (
        <p key={n} className="flex gap-2">
          <span aria-hidden className="text-lakers-gold-dark">ⓘ</span>
          <span>{n}</span>
        </p>
      ))}
    </div>
  );
}

// ── Small pieces ─────────────────────────────────────────────────────────────

export function RankChip({ rank, of = 30 }: { rank: number | null; of?: number }) {
  if (rank == null) return <span className="text-xs text-text-faint">—</span>;
  return (
    <span className={`text-xs font-mono font-semibold ${rankTone(rank, of)}`} title={`${ordinal(rank)} of ${of}`}>
      {ordinal(rank)}
    </span>
  );
}

export function MetricTile({ metric, value, sub, smallSample }: {
  metric: RankedMetric;
  value: MetricWithRank | undefined;
  sub?: string;
  smallSample?: boolean;
}) {
  const meta = METRIC_META[metric];
  return (
    <div className="glass-card stat-card p-4" title={`${meta.help} · box-score estimate`}>
      <p className="text-xs uppercase tracking-wider text-text-muted">{meta.label}</p>
      <div className="flex items-baseline gap-2 mt-1">
        <p className="text-2xl font-bold font-mono text-text-primary">{fmtMetric(metric, value?.value)}</p>
        <RankChip rank={value?.rank ?? null} />
      </div>
      <p className="text-xs text-text-faint mt-1">
        {sub ?? meta.help}
        {smallSample && <SmallSampleTag className="ml-2" />}
      </p>
    </div>
  );
}

export function SmallSampleTag({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide bg-input text-text-muted ${className}`} title="Fewer than 5 games — treat with caution">
      small sample
    </span>
  );
}

const STATUS_STYLE: Record<RosterStatus, { label: string; cls: string }> = {
  returning: { label: "Returning", cls: "bg-input text-text-secondary" },
  new: { label: "New", cls: "bg-lakers-gold/20 text-lakers-gold-dark dark:text-lakers-gold" },
  rookie: { label: "Rookie", cls: "bg-lakers-purple/20 text-lakers-purple dark:text-lakers-purple-light" },
};

export function StatusBadge({ status }: { status: RosterStatus }) {
  const s = STATUS_STYLE[status];
  return <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${s.cls}`}>{s.label}</span>;
}

export function TrendArrow({ trend }: { trend: Trend | null }) {
  if (!trend || trend === "flat") return <span className="text-text-faint" aria-label="steady">–</span>;
  return trend === "up"
    ? <span className="text-green-500" aria-label="trending up" title="Last 5 ≥10% above season average">▲</span>
    : <span className="text-red-400" aria-label="trending down" title="Last 5 ≥10% below season average">▼</span>;
}

export function InjuryTag({ injury }: { injury: InjuryView | null }) {
  if (!injury) return null;
  const out = /out/i.test(injury.status);
  return (
    <span
      className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${out ? "bg-red-500/15 text-red-500" : "bg-amber-500/15 text-amber-600 dark:text-amber-400"}`}
      title={[injury.injuryType, injury.detail].filter(Boolean).join(" — ")}
    >
      {out ? "✕ " : "! "}
      {injury.status}
    </span>
  );
}

export function FormStrip({ games, label }: { games: GameResultView[]; label?: string }) {
  if (!games.length) return <span className="text-xs text-text-faint">No games yet</span>;
  const ordered = [...games].reverse();
  return (
    <div className="flex gap-1" aria-label={label ?? "Recent results, oldest to newest"}>
      {ordered.map((g) => (
        <span
          key={g.gameId}
          className={`h-6 min-w-6 flex-1 max-w-9 rounded-sm flex items-center justify-center text-[10px] font-bold ${g.result === "W" ? "bg-green-500/25 text-green-600 dark:text-green-400" : "bg-red-500/20 text-red-500 dark:text-red-400"}`}
          title={`${g.result} ${g.points}-${g.oppPoints} ${g.homeAway === "HOME" ? "vs" : "@"} ${g.opponent.abbreviation} · ${gameDay(g.date).toLocaleDateString()}`}
        >
          {g.result}
        </span>
      ))}
    </div>
  );
}

export type Window = "season" | "last10";

/** Season vs last-10 switch. Pass `games` to label the season button and disable last 10 early on. */
export function WindowToggle({ value, onChange, games }: { value: Window; onChange: (w: Window) => void; games?: number }) {
  const tooFew = games != null && games <= 10;
  return (
    <div role="group" aria-label="Time window" className="flex gap-1">
      {(["season", "last10"] as Window[]).map((w) => (
        <button
          key={w}
          onClick={() => onChange(w)}
          aria-pressed={value === w}
          disabled={w === "last10" && tooFew}
          title={w === "last10" && tooFew ? "10 or fewer games played — same as season" : undefined}
          className={`px-2.5 py-1 rounded-md text-xs border transition-colors disabled:opacity-40 ${value === w ? "bg-lakers-purple text-white border-lakers-purple" : "border-border-theme text-text-muted hover:text-text-primary"}`}
        >
          {w === "season" ? (games != null ? `Season (${games} GP)` : "Season") : "Last 10"}
        </button>
      ))}
    </div>
  );
}

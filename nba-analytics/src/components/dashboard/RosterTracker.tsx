"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { fmtNum, fmtPct, fmtSigned } from "@/lib/format";
import { InjuryTag, SmallSampleTag, StatusBadge, TrendArrow } from "./primitives";
import { PlayerAvatar } from "./PlayerAvatar";
import type { PlayerLine, RosterRow, RosterStatus } from "@/lib/dashboard-types";

type Filter = "all" | RosterStatus;
type View = "season" | "baseline";

const COLS: { key: keyof PlayerLine; label: string; fmt: (v: number | null) => string; title: string }[] = [
  { key: "gamesPlayed", label: "GP", fmt: (v) => fmtNum(v, 0), title: "Games played" },
  { key: "minutes", label: "MIN", fmt: (v) => fmtNum(v), title: "Minutes per game" },
  { key: "points", label: "PTS", fmt: (v) => fmtNum(v), title: "Points per game" },
  { key: "rebounds", label: "REB", fmt: (v) => fmtNum(v), title: "Rebounds per game" },
  { key: "assists", label: "AST", fmt: (v) => fmtNum(v), title: "Assists per game" },
  { key: "tsPct", label: "TS%", fmt: (v) => fmtPct(v), title: "True shooting %" },
  { key: "threePct", label: "3P%", fmt: (v) => fmtPct(v), title: "Three-point %" },
  { key: "usageRate", label: "USG%", fmt: (v) => fmtPct(v), title: "Usage rate" },
  { key: "plusMinus", label: "+/-", fmt: (v) => fmtSigned(v), title: "Plus/minus per game" },
];

export function RosterTracker({ roster, season, previous }: { roster: RosterRow[]; season: string; previous: string }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [view, setView] = useState<View>("season");
  const rows = useMemo(() => roster.filter((r) => filter === "all" || r.status === filter), [roster, filter]);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: roster.length, returning: 0, new: 0, rookie: 0 };
    for (const r of roster) c[r.status] += 1;
    return c;
  }, [roster]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div role="group" aria-label="Filter by roster status" className="flex flex-wrap gap-1">
          {(["all", "new", "returning", "rookie"] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              aria-pressed={filter === f}
              className={`px-2.5 py-1 rounded-md text-xs border transition-colors ${filter === f ? "bg-lakers-purple text-white border-lakers-purple" : "border-border-theme text-text-muted hover:text-text-primary"}`}
            >
              {f === "all" ? "All" : f[0].toUpperCase() + f.slice(1)} ({counts[f]})
            </button>
          ))}
        </div>
        <div role="group" aria-label="Stat line" className="flex gap-1 ml-auto">
          {(["season", "baseline"] as View[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              aria-pressed={view === v}
              className={`px-2.5 py-1 rounded-md text-xs border transition-colors ${view === v ? "bg-lakers-gold text-black border-lakers-gold" : "border-border-theme text-text-muted hover:text-text-primary"}`}
            >
              {v === "season" ? season : `${previous} (any team)`}
            </button>
          ))}
        </div>
      </div>

      <div className="relative overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-text-muted border-b border-border-theme">
              <th className="py-2 pr-3 font-medium">Player</th>
              <th className="py-2 pr-3 font-medium">{view === "season" ? "Team" : "Was"}</th>
              {COLS.map((c) => (
                <th key={c.key} className="py-2 px-2 font-medium text-right" title={c.title}>{c.label}</th>
              ))}
              <th className="py-2 px-2 font-medium text-right" title="Last 5 games: points / TS%">L5 PTS</th>
              <th className="py-2 pl-1 font-medium" title="Last 5 vs season scoring"><span className="sr-only">Trend</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const line = view === "season" ? r.current : r.baseline;
              return (
                <tr key={r.player.id} className="border-b border-border-theme/60 hover:bg-surface-hover">
                  <td className="py-2 pr-3 whitespace-nowrap">
                    <PlayerAvatar name={r.player.fullName} headshotUrl={r.player.headshotUrl} size={28} />
                    <Link href={`/players/${r.player.id}`} className="ml-2 align-middle font-medium text-text-primary hover:text-heading">{r.player.fullName}</Link>
                    <span className="ml-1.5 text-xs text-text-faint">{r.player.position ?? ""}</span>
                    <span className="ml-2 inline-flex gap-1 align-middle">
                      <StatusBadge status={r.status} />
                      {view === "season" && r.smallSample && r.current && <SmallSampleTag />}
                      <InjuryTag injury={r.injury} />
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-xs text-text-muted">{line?.teamAbbr ?? (view === "baseline" && r.status === "rookie" ? "Rookie" : "—")}</td>
                  {COLS.map((c) => (
                    <td key={c.key} className="py-2 px-2 text-right font-mono tabular-nums text-text-secondary">
                      {line ? c.fmt(line[c.key] as number | null) : "—"}
                    </td>
                  ))}
                  <td className="py-2 px-2 text-right font-mono tabular-nums text-text-secondary" title={r.last5.games ? `TS% ${fmtPct(r.last5.tsPct)} over ${r.last5.games} games` : undefined}>
                    {fmtNum(r.last5.points)}
                  </td>
                  <td className="py-2 pl-1"><TrendArrow trend={r.pointsTrend} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {view === "season" && rows.some((r) => !r.current) && (
        <p className="text-xs text-text-faint mt-2">Players without a {season} line haven&apos;t appeared yet — switch to {previous} to see their baseline.</p>
      )}
    </div>
  );
}

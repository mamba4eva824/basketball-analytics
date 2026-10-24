"use client";
import { useMemo, useState } from "react";
import { Bar, CartesianGrid, Cell, ComposedChart, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { format } from "date-fns";
import { useThemeColors } from "@/lib/ThemeContext";
import { fmtNum, fmtSigned } from "@/lib/format";
import { PM_WINDOWS, plusMinusTrend, type Absence, type PlusMinusPoint, type PlusMinusTrend } from "@/lib/analytics/plusMinus";
import { SMALL_SAMPLE_GAMES } from "@/lib/analytics/projection";
import { EmptyState, SmallSampleTag, StatusBadge } from "./primitives";
import type { PlusMinusSeriesView } from "@/lib/dashboard-types";

type Mode = "perGame" | "per36";
type SortKey = "seasonAvg" | "seasonPer36" | "lastAvg" | "gamesMissed";

/**
 * Season +/- per player with a moving average over games PLAYED.
 * Missed games are shaded gaps, never zeros, so injuries don't flatten the line.
 */
export function PlusMinusTracker({ series }: { series: PlusMinusSeriesView }) {
  const c = useThemeColors();
  const [win, setWin] = useState<number>(PM_WINDOWS[0]);
  const [mode, setMode] = useState<Mode>("perGame");
  const [sort, setSort] = useState<SortKey>("seasonAvg");

  const trends = useMemo(() => {
    const slots = series.games.map((g) => ({ ...g, date: new Date(g.date) }));
    return series.players.map((p) => ({
      player: p,
      trend: plusMinusTrend(slots, p.lines, {
        window: win,
        joinedAfter: p.joinedAfter ? new Date(p.joinedAfter) : null,
        currentInjury: p.currentInjury,
      }),
    }));
  }, [series, win]);

  const firstPlayed = trends.find((t) => t.trend.summary.gamesPlayed > 0)?.player.playerId ?? trends[0]?.player.playerId;
  const [selected, setSelected] = useState<string | undefined>(undefined);
  const activeId = selected ?? firstPlayed;
  const active = trends.find((t) => t.player.playerId === activeId);

  const sorted = useMemo(() => {
    const val = (t: PlusMinusTrend) => t.summary[sort];
    return [...trends].sort((a, b) => {
      const va = val(a.trend), vb = val(b.trend);
      if (va == null) return 1;
      if (vb == null) return -1;
      return (vb as number) - (va as number);
    });
  }, [trends, sort]);

  if (!series.games.length || !active) return <EmptyState>The +/- trend appears after the first game.</EmptyState>;

  const s = active.trend.summary;
  const rollKey = mode === "perGame" ? "rollingAvg" : "rollingPer36";
  // Games before a mid-season arrival aren't part of this player's season at all
  const points = active.trend.points.filter((p) => p.availability !== "not-with-team");
  const label = (id: string) => {
    const p = points.find((x) => x.gameId === id);
    return p ? `${format(p.date, "MMM d")} ${p.opponentAbbr}` : "";
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-text-muted">
          Player
          <select
            id="pm-player"
            value={activeId}
            onChange={(e) => setSelected(e.target.value)}
            className="bg-input border border-border-theme rounded-lg px-3 py-2 text-sm text-text-primary min-w-56 max-w-full"
          >
            {trends.map((t) => (
              <option key={t.player.playerId} value={t.player.playerId}>
                {t.player.name} ({t.trend.summary.gamesPlayed} GP)
              </option>
            ))}
          </select>
        </label>
        <Toggle label="Measure" value={mode} onChange={setMode} options={[["perGame", "+/- per game"], ["per36", "Per 36 min"]]} />
        <Toggle label="Moving average" value={String(win)} onChange={(v) => setWin(Number(v))} options={PM_WINDOWS.map((w) => [String(w), `${w} games`])} />
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <Stat label="Played / missed" value={`${s.gamesPlayed} / ${s.gamesMissed}`} />
        <Stat label="Season avg" value={fmtSigned(s.seasonAvg)} />
        <Stat label={`Last ${win} played`} value={fmtSigned(s.lastAvg)} trend={s.trend} />
        <Stat label="Per 36 min" value={fmtSigned(s.seasonPer36)} />
        {s.gamesPlayed > 0 && s.gamesPlayed < SMALL_SAMPLE_GAMES && <SmallSampleTag className="self-center" />}
      </div>

      {s.gamesPlayed === 0 ? (
        <EmptyState>{active.player.name} hasn&apos;t played yet{active.player.currentInjury ? ` (${active.player.currentInjury})` : ""}.</EmptyState>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={points} margin={{ top: 16, right: 8, bottom: 0, left: -8 }} barCategoryGap={2}>
            <CartesianGrid vertical={false} stroke={c.grid} />
            {s.absences.map((a) => (
              <ReferenceArea
                key={a.startGameId}
                x1={a.startGameId}
                x2={a.endGameId}
                fill={c.refLine}
                fillOpacity={0.35}
                label={{ value: `${a.kind === "injury" ? "Out" : "Missed"} ${a.games}`, position: "insideTop", fill: c.tick, fontSize: 10 }}
              />
            ))}
            <XAxis dataKey="gameId" tickFormatter={label} tick={{ fill: c.tick, fontSize: 10 }} tickLine={false} axisLine={{ stroke: c.axis }} interval="preserveStartEnd" minTickGap={28} />
            <YAxis tick={{ fill: c.tick, fontSize: 11 }} tickLine={false} axisLine={false} width={40} tickFormatter={(v: number) => fmtSigned(v, 0)} />
            <ReferenceLine y={0} stroke={c.refLine} />
            <Tooltip cursor={{ fill: c.grid }} content={({ active: on, payload }) => <PointTooltip on={!!on} p={payload?.[0]?.payload as PlusMinusPoint | undefined} win={win} />} />
            {mode === "perGame" && (
              <Bar dataKey="plusMinus" name="Game +/-" radius={[3, 3, 3, 3]} maxBarSize={14} isAnimationActive={false}>
                {points.map((p) => (
                  <Cell key={p.gameId} fill={(p.plusMinus ?? 0) >= 0 ? c.us : c.them} fillOpacity={0.45} />
                ))}
              </Bar>
            )}
            <Line dataKey={rollKey} name={`${win}-game avg`} type="monotone" stroke={c.labelText} strokeWidth={2.5} dot={false} connectNulls={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      )}
      <p className="text-xs text-text-faint">
        {mode === "perGame" ? "Bars: each game's +/- (purple ahead, orange behind). " : ""}
        Line: average of the last {win} games <em>played</em>{mode === "per36" ? ", minutes-weighted per 36" : ""}. Shaded bands are games missed —
        they break the line instead of counting as zero. &ldquo;Out&rdquo; means the injury report or a DNP reason
        lists an injury; otherwise the band reads &ldquo;Missed&rdquo;, since a box score can&apos;t tell an injury from a healthy scratch.
        {s.absences.length > 0 && (
          <> Absences: {s.absences.map((a) => `${a.games} game${a.games > 1 ? "s" : ""} from ${label(a.startGameId)}${a.reason ? ` (${a.reason})` : ""}${a.ongoing ? " — ongoing" : ""}`).join("; ")}.</>
        )}
      </p>

      <div className="relative overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">Plus-minus summary by player; select a name to chart it</caption>
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-text-muted border-b border-border-theme">
              <th className="py-2 pr-3 font-medium">Player</th>
              <th className="py-2 px-2 font-medium text-right">GP</th>
              <SortTh k="gamesMissed" sort={sort} setSort={setSort} title="Team games missed (after joining)">Missed</SortTh>
              <SortTh k="seasonAvg" sort={sort} setSort={setSort} title="Season +/- per game played">+/-</SortTh>
              <SortTh k="seasonPer36" sort={sort} setSort={setSort} title="Season +/- per 36 minutes">Per 36</SortTh>
              <SortTh k="lastAvg" sort={sort} setSort={setSort} title={`Average of the last ${win} games played`}>{`L${win}`}</SortTh>
              <th className="py-2 pl-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(({ player, trend }) => {
              const sm = trend.summary;
              const ongoing = sm.absences.find((a) => a.ongoing);
              const isActive = player.playerId === activeId;
              return (
                <tr key={player.playerId} className={`border-b border-border-theme/60 ${isActive ? "bg-lakers-purple/10" : "hover:bg-surface-hover"}`}>
                  <td className="py-2 pr-3 whitespace-nowrap">
                    <button onClick={() => setSelected(player.playerId)} aria-pressed={isActive} className="font-medium text-text-primary hover:text-heading text-left">
                      {player.name}
                    </button>
                    <span className="ml-1.5 align-middle"><StatusBadge status={player.status} /></span>
                  </td>
                  <td className="py-2 px-2 text-right font-mono tabular-nums text-text-secondary">{sm.gamesPlayed}</td>
                  <td className="py-2 px-2 text-right font-mono tabular-nums text-text-secondary">{sm.gamesMissed || "–"}</td>
                  <td className={`py-2 px-2 text-right font-mono tabular-nums ${tone(sm.seasonAvg)}`}>{fmtSigned(sm.seasonAvg)}</td>
                  <td className={`py-2 px-2 text-right font-mono tabular-nums ${tone(sm.seasonPer36)}`}>{fmtSigned(sm.seasonPer36)}</td>
                  <td className="py-2 px-2 text-right font-mono tabular-nums text-text-secondary">
                    {fmtSigned(sm.lastAvg)} <TrendMark trend={sm.trend} />
                  </td>
                  <td className="py-2 pl-2 text-xs whitespace-nowrap">
                    {ongoing ? (
                      <AbsenceChip absence={ongoing} neverPlayed={sm.gamesPlayed === 0} />
                    ) : sm.gamesPlayed > 0 && sm.gamesPlayed < SMALL_SAMPLE_GAMES ? (
                      <SmallSampleTag />
                    ) : (
                      <span className="text-text-faint">Active</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AbsenceChip({ absence, neverPlayed }: { absence: Absence; neverPlayed: boolean }) {
  const n = `${absence.games} game${absence.games > 1 ? "s" : ""}`;
  if (absence.kind === "injury") {
    return (
      <span className="rounded px-1.5 py-0.5 bg-red-500/15 text-red-500 dark:text-red-400 font-semibold">
        ✕ Out {n}{absence.reason ? ` · ${absence.reason}` : ""}
      </span>
    );
  }
  // No injury evidence: could be a healthy scratch, so stay neutral
  return (
    <span className="rounded px-1.5 py-0.5 bg-input text-text-muted" title="No injury listed — could be a coach's decision">
      {neverPlayed ? "Hasn't played" : `DNP last ${n}`}
      {absence.reason ? ` · ${absence.reason}` : ""}
    </span>
  );
}

const tone = (v: number | null) => (v == null ? "text-text-faint" : v > 0 ? "text-green-600 dark:text-green-400" : v < 0 ? "text-red-500 dark:text-red-400" : "text-text-secondary");

function TrendMark({ trend }: { trend: PlusMinusTrend["summary"]["trend"] }) {
  if (trend === "up") return <span className="text-green-500" title="Last window ≥3 above season average">▲</span>;
  if (trend === "down") return <span className="text-red-400" title="Last window ≥3 below season average">▼</span>;
  return null;
}

function Stat({ label, value, trend }: { label: string; value: string; trend?: PlusMinusTrend["summary"]["trend"] }) {
  return (
    <div>
      <p className="font-mono text-lg font-semibold text-text-primary tabular-nums">
        {value} {trend && <TrendMark trend={trend} />}
      </p>
      <p className="text-[10px] uppercase tracking-wider text-text-faint">{label}</p>
    </div>
  );
}

function Toggle<T extends string>({ label, value, onChange, options }: { label: string; value: T; onChange: (v: T) => void; options: (readonly [T, string])[] | [T, string][] }) {
  return (
    <div className="flex flex-col gap-1 text-xs text-text-muted">
      {label}
      <div role="group" aria-label={label} className="flex gap-1">
        {options.map(([v, text]) => (
          <button
            key={v}
            onClick={() => onChange(v)}
            aria-pressed={value === v}
            className={`px-2.5 py-1.5 rounded-md text-xs border transition-colors ${value === v ? "bg-lakers-purple text-white border-lakers-purple" : "border-border-theme text-text-muted hover:text-text-primary"}`}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

function SortTh({ k, sort, setSort, title, children }: { k: SortKey; sort: SortKey; setSort: (k: SortKey) => void; title: string; children: React.ReactNode }) {
  return (
    <th className="py-2 px-2 font-medium text-right" title={title} aria-sort={sort === k ? "descending" : "none"}>
      <button onClick={() => setSort(k)} className={`uppercase tracking-wider ${sort === k ? "text-heading" : "hover:text-text-primary"}`}>
        {children}
        {sort === k && " ▾"}
      </button>
    </th>
  );
}

function PointTooltip({ on, p, win }: { on: boolean; p: PlusMinusPoint | undefined; win: number }) {
  const c = useThemeColors();
  if (!on || !p) return null;
  return (
    <div style={{ backgroundColor: c.tooltipBg, border: `1px solid ${c.tooltipBorder}`, borderRadius: 8, fontSize: 12, padding: "8px 10px" }}>
      <p style={{ color: c.tooltipLabel, fontWeight: 600 }}>
        {format(p.date, "EEE MMM d")} · {p.opponentAbbr} · {p.won ? "W" : "L"}
      </p>
      {p.availability === "played" ? (
        <>
          <p style={{ color: c.labelText }}>+/- {fmtSigned(p.plusMinus)} in {fmtNum(p.minutes)} min</p>
          <p style={{ color: c.labelText }}>
            {win}-game avg {fmtSigned(p.rollingAvg)} · per 36 {fmtSigned(p.rollingPer36)}
            {p.windowGames < win && ` (${p.windowGames} games so far)`}
          </p>
        </>
      ) : (
        <p style={{ color: c.labelText }}>Did not play{p.missedReason ? ` — ${p.missedReason}` : ""}</p>
      )}
    </div>
  );
}

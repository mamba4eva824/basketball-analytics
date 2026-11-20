"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { format } from "date-fns";
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useStarOff } from "@/lib/hooks/useStarOff";
import { useThemeColors } from "@/lib/ThemeContext";
import { DASH, fmtNum, fmtPct, fmtSigned, gameDay } from "@/lib/format";
import { NEVER_TOGETHER, SMALL_SAMPLE_MINUTES, type ComboRow } from "@/lib/analytics/lineupCombos";
import { MISSED_GAMES_SMALL_SAMPLE, labHref, type GameSetSummary, type StarSplit } from "@/lib/analytics/starOff";
import { PageSkeleton } from "@/components/ui/LoadingSkeleton";
import { ErrorDisplay } from "@/components/ui/ErrorDisplay";
import { PlayerAvatar } from "./PlayerAvatar";
import { DataNotes, EmptyState, Section, SmallSampleTag } from "./primitives";
import type { DriverPlayer, StarOffData } from "@/lib/dashboard-types";

const firstName = (name: string) => name.split(" ")[0];
const surname = (name: string) => name.split(" ").slice(1).join(" ") || name;
const tone = (v: number | null | undefined) =>
  v == null || Math.abs(v) < 0.05 ? "text-text-secondary" : v > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400";

/** A tag for under-50-minute samples from NBA.com group totals (SmallSampleTag's tooltip says games). */
function MinutesSampleTag({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide bg-input text-text-muted ${className}`} title={`Fewer than ${SMALL_SAMPLE_MINUTES} minutes — treat with caution`}>
      small sample
    </span>
  );
}

/**
 * /without-luka — how the Lakers do when Luka Dončić (or any picked player) is off the floor:
 * his bench minutes inside games (NBA.com on/off and lineup totals) and the games he missed.
 */
export function WithoutStar() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const player = params.get("player");
  const q = useStarOff(player);

  if (q.isLoading && !q.data) return <PageSkeleton />;
  if (q.isError && !q.data) return <ErrorDisplay title="Without-Luka view unavailable" message={(q.error as Error).message} onRetry={() => q.refetch()} />;
  const data = q.data!;
  const star = data.star;

  const pick = (id: string) => router.replace(`${pathname}?player=${id}`, { scroll: false });

  if (!star) {
    return (
      <div className="space-y-6">
        <DataNotes notes={data.dataNotes} />
        <Section title="When Luka sits" subtitle={data.season.displayName}>
          <EmptyState>No player game logs or on/off totals for {data.season.id} yet. Run <code>etl/refresh.py</code> from a home connection.</EmptyState>
        </Section>
      </div>
    );
  }
  const first = firstName(star.name);

  return (
    <div className={`space-y-6 ${q.isFetching ? "opacity-70 transition-opacity" : ""}`}>
      <DataNotes notes={data.dataNotes} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <PlayerAvatar name={star.name} headshotUrl={star.headshotUrl} size={48} />
          <div className="min-w-0">
            <h1 className="text-2xl text-heading">When {first} sits</h1>
            <p className="text-sm text-text-muted">
              {data.season.displayName}: the Lakers with {star.name} off the floor, during games and in the games he missed.
            </p>
          </div>
        </div>
        {data.candidates.length > 1 && (
          <label className="flex items-center gap-2 text-sm text-text-muted">
            <span>Player</span>
            <select
              id="star-off-player"
              value={star.id}
              onChange={(e) => pick(e.target.value)}
              className="rounded-lg border border-border-theme bg-input px-2 py-1.5 text-text-primary"
            >
              {data.candidates.map((c) => (
                <option key={c.id} value={c.id}>{c.name}{c.onRoster ? "" : " (former)"}</option>
              ))}
            </select>
          </label>
        )}
      </div>

      <BenchMinutes data={data} first={first} />
      <Teammates data={data} first={first} />
      <LineupsWithout data={data} first={first} />
      <MissedGames data={data} first={first} />

      <p className="text-xs text-text-faint">
        Bench-minute numbers are NBA.com on/off and lineup totals, season to date
        {data.lastUpdated ? ` (refreshed ${format(new Date(data.lastUpdated), "MMM d, h:mm a")})` : ""}: the team with {first} off the floor = all team minutes minus his.
        They aren&apos;t trended game by game, and teammates&apos; own points or usage during those minutes need play-by-play data the app doesn&apos;t store.
      </p>
    </div>
  );
}

// ── Team with the star on the bench ──────────────────────────────────────────

type Row = { label: string; help: string; off: number | null; on: number | null; fmt: (v: number | null) => string; lowerBetter?: boolean; diffFmt?: (v: number | null) => string };

function splitRows(s: StarSplit): Row[] {
  const { off, on } = s;
  const per48 = (r: ComboRow) => (r.plusMinus != null && r.minutes ? (48 * r.plusMinus) / r.minutes : null);
  const dreb = (r: ComboRow) => (r.oppOrebPct == null ? null : 1 - r.oppOrebPct);
  const pctDiff = (v: number | null) => (v == null ? DASH : `${v > 0 ? "+" : ""}${(100 * v).toFixed(1)}`);
  return [
    { label: "Offensive rating", help: "Points per 100 possessions", off: off.offRtg, on: on.offRtg, fmt: (v) => fmtNum(v) },
    { label: "Defensive rating", help: "Opponent points per 100 possessions (lower is better)", off: off.defRtg, on: on.defRtg, fmt: (v) => fmtNum(v), lowerBetter: true },
    { label: "Net rating", help: "ORtg − DRtg", off: off.netRtg, on: on.netRtg, fmt: fmtSigned },
    { label: "Pace/48", help: "Possessions per 48 minutes (lineup data has minutes)", off: off.pace, on: on.pace, fmt: (v) => fmtNum(v) },
    { label: "eFG%", help: "(FGM + 0.5·3PM) / FGA", off: off.efgPct, on: on.efgPct, fmt: fmtPct, diffFmt: pctDiff },
    { label: "TS%", help: "PTS / (2·(FGA + 0.44·FTA))", off: s.tsOff, on: s.tsOn, fmt: fmtPct, diffFmt: pctDiff },
    { label: "3PA rate", help: "Share of shots that are threes", off: off.threePaRate, on: on.threePaRate, fmt: fmtPct, diffFmt: pctDiff },
    { label: "3P%", help: "Three-point percentage", off: off.threePct, on: on.threePct, fmt: fmtPct, diffFmt: pctDiff },
    { label: "FT rate", help: "Free-throw attempts per FGA", off: off.ftRate, on: on.ftRate, fmt: fmtPct, diffFmt: pctDiff },
    { label: "Turnover %", help: "Turnovers per play (lower is better)", off: off.tovPct, on: on.tovPct, fmt: fmtPct, lowerBetter: true, diffFmt: pctDiff },
    { label: "Assist rate", help: "Assists per made field goal", off: off.astPct, on: on.astPct, fmt: fmtPct, diffFmt: pctDiff },
    { label: "OREB%", help: "Share of own misses rebounded (needs opponent totals)", off: off.orebPct, on: on.orebPct, fmt: fmtPct, diffFmt: pctDiff },
    { label: "DREB%", help: "Share of opponent misses rebounded (needs opponent totals)", off: dreb(off), on: dreb(on), fmt: fmtPct, diffFmt: pctDiff },
    { label: "+/- per 48", help: "Point differential per 48 minutes", off: per48(off), on: per48(on), fmt: fmtSigned },
  ];
}

function BenchMinutes({ data, first }: { data: StarOffData; first: string }) {
  const s = data.split;
  const title = `Team with ${first} on the bench`;
  if (!s) return <Section title={title}><EmptyState>On/off totals aren&apos;t loaded for this season yet.</EmptyState></Section>;
  if (s.off.error) return <Section title={title}><EmptyState>{s.off.error === NEVER_TOGETHER ?`${first} hasn't been off the floor this season.` : s.off.error}</EmptyState></Section>;
  const swing = s.off.netRtg != null && s.on.netRtg != null ? s.off.netRtg - s.on.netRtg : null;

  return (
    <Section
      title={title}
      subtitle={`NBA.com totals over every minute he sat this season, next to the minutes he played. ${s.off.warning ?? ""}`}
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Tile label="Minutes without him" value={fmtNum(s.off.minutes, 0)} sub={`${fmtPct(s.shareOff)} of team minutes`} small={s.off.smallSample} />
        <Tile label="Net rating without him" value={fmtSigned(s.off.netRtg)} sub={`${fmtSigned(s.on.netRtg)} with him`} valueCls={tone(s.off.netRtg)} />
        <Tile label="On/off swing" value={fmtSigned(swing)} sub="Net rating without − with" valueCls={tone(swing)} />
        <Tile label="Plus-minus without him" value={fmtSigned(s.off.plusMinus, 0)} sub={`${fmtNum(s.off.pts, 0)} scored · ${fmtNum(s.off.oppPts, 0)} allowed`} valueCls={tone(s.off.plusMinus)} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)] gap-6">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[440px]">
            <thead>
              <tr className="text-xs uppercase tracking-wider text-text-muted border-b border-border-theme">
                <th className="text-left font-medium py-2 pr-2">Metric</th>
                <th className="text-right font-medium py-2 px-2">Without {first}</th>
                <th className="text-right font-medium py-2 px-2">With {first}</th>
                <th className="text-right font-medium py-2 pl-2" title="Without − with; green = better without him">Diff</th>
              </tr>
            </thead>
            <tbody>
              {splitRows(s).map((r) => {
                const d = r.off != null && r.on != null ? r.off - r.on : null;
                const signed = d == null ? null : r.lowerBetter ? -d : d;
                return (
                  <tr key={r.label} className="border-b border-border-theme/50 last:border-0">
                    <td className="py-1.5 pr-2 text-text-secondary" title={r.help}>{r.label}</td>
                    <td className="py-1.5 px-2 text-right font-mono text-text-primary">{r.fmt(r.off)}</td>
                    <td className="py-1.5 px-2 text-right font-mono text-text-secondary">{r.fmt(r.on)}</td>
                    <td className={`py-1.5 pl-2 text-right font-mono ${tone(signed)}`}>{(r.diffFmt ?? fmtSigned)(d)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-text-faint">Percentage differences are in points. &quot;—&quot; = not computable from the loaded totals (e.g. rebounding needs NBA.com opponent totals).</p>
        </div>
        <NetChart split={s} first={first} />
      </div>
    </Section>
  );
}

function Tile({ label, value, sub, small, valueCls = "text-text-primary" }: { label: string; value: string; sub: string; small?: boolean; valueCls?: string }) {
  return (
    <div className="rounded-xl bg-input/60 p-3 min-w-0">
      <p className="text-xs uppercase tracking-wider text-text-muted">{label}</p>
      <p className={`text-2xl font-bold font-mono mt-1 ${valueCls}`}>{value}</p>
      <p className="text-xs text-text-faint mt-0.5">{sub}{small && <MinutesSampleTag className="ml-2" />}</p>
    </div>
  );
}

function NetChart({ split, first }: { split: StarSplit; first: string }) {
  const c = useThemeColors();
  const rows = [
    { name: `Without ${first}`, value: split.off.netRtg, fill: c.them },
    { name: `With ${first}`, value: split.on.netRtg, fill: c.us },
    { name: "Season", value: split.team.netRtg, fill: c.trend },
  ].filter((r) => r.value != null) as { name: string; value: number; fill: string }[];
  if (!rows.length) return null;
  return (
    <figure className="min-w-0">
      <figcaption className="text-xs uppercase tracking-wider text-text-muted mb-2">Net rating</figcaption>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
            <CartesianGrid stroke={c.grid} vertical={false} />
            <XAxis dataKey="name" tick={{ fill: c.tick, fontSize: 11 }} axisLine={{ stroke: c.axis }} tickLine={false} />
            <YAxis tick={{ fill: c.tick, fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => fmtSigned(v, 0)} />
            <ReferenceLine y={0} stroke={c.refLine} />
            <Tooltip
              cursor={{ fill: c.grid }}
              contentStyle={{ background: c.tooltipBg, border: `1px solid ${c.tooltipBorder}`, borderRadius: 8 }}
              labelStyle={{ color: c.tooltipLabel }}
              itemStyle={{ color: c.labelText }}
              formatter={(v) => [fmtSigned(Number(v)), "Net rating"]}
            />
            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
              {rows.map((r) => <Cell key={r.name} fill={r.fill} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

// ── Teammates ───────────────────────────────────────────────────────────────

function Who({ p }: { p: DriverPlayer | undefined }) {
  if (!p) return <span className="text-text-muted">{DASH}</span>;
  return (
    <span className="flex items-center gap-2 min-w-0">
      <PlayerAvatar name={p.name} headshotUrl={p.headshotUrl} size={24} />
      <span className="truncate text-text-primary">{p.name}</span>
      {!p.onRoster && <span className="text-[10px] uppercase text-text-faint">former</span>}
    </span>
  );
}

function Teammates({ data, first }: { data: StarOffData; first: string }) {
  const title = `Teammates without ${first}`;
  if (!data.split) return null;
  const rows = data.teammates.filter((t) => !t.without.error);
  return (
    <Section
      title={title}
      subtitle={`The team's results while each player was on the floor and ${first} wasn't — team numbers, not the player's own box score. Ranked by net rating; under ${SMALL_SAMPLE_MINUTES} minutes is flagged and listed after.`}
    >
      {!rows.length ? (
        <EmptyState>No teammate has played without {first} yet.</EmptyState>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="text-xs uppercase tracking-wider text-text-muted border-b border-border-theme">
                <th className="text-left font-medium py-2 pr-2">Player</th>
                <th className="text-right font-medium py-2 px-2" title={`Minutes on the floor with ${first} off`}>Min w/o</th>
                <th className="text-right font-medium py-2 px-2">ORtg</th>
                <th className="text-right font-medium py-2 px-2" title="Lower is better">DRtg</th>
                <th className="text-right font-medium py-2 px-2">Net w/o</th>
                <th className="text-right font-medium py-2 px-2" title={`Team net rating with this player and ${first} both on`}>Net with {first}</th>
                <th className="text-right font-medium py-2 pl-2" title={`Lineup Lab: this player on, ${first} off`}>Lab</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.playerId} className="border-b border-border-theme/50 last:border-0">
                  <td className="py-1.5 pr-2"><Who p={data.players[t.playerId]} /></td>
                  <td className="py-1.5 px-2 text-right font-mono text-text-secondary">
                    {fmtNum(t.without.minutes, 0)}{t.without.smallSample && <MinutesSampleTag className="ml-1" />}
                  </td>
                  <td className="py-1.5 px-2 text-right font-mono text-text-secondary">{fmtNum(t.without.offRtg)}</td>
                  <td className="py-1.5 px-2 text-right font-mono text-text-secondary">{fmtNum(t.without.defRtg)}</td>
                  <td className={`py-1.5 px-2 text-right font-mono font-semibold ${tone(t.without.netRtg)}`}>{fmtSigned(t.without.netRtg)}</td>
                  <td className="py-1.5 px-2 text-right font-mono text-text-secondary">{t.with.error ? DASH : fmtSigned(t.with.netRtg)}</td>
                  <td className="py-1.5 pl-2 text-right"><Link href={labHref(t.without)} className="text-xs underline text-text-muted hover:text-text-primary">Open</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

// ── Lineups without the star ────────────────────────────────────────────────

function GroupTable({ title, rows, players, empty }: { title: string; rows: ComboRow[]; players: Record<string, DriverPlayer>; empty: string }) {
  const names = (r: ComboRow) => r.on.map((id) => surname(players[id]?.name ?? `#${id}`)).join(" · ");
  return (
    <div className="min-w-0">
      <h4 className="text-sm font-semibold text-text-primary mb-1">{title}</h4>
      {!rows.length ? (
        <p className="text-sm text-text-muted py-3">{empty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[420px]">
            <thead>
              <tr className="text-xs uppercase tracking-wider text-text-muted border-b border-border-theme">
                <th className="text-left font-medium py-1.5 pr-2">Players</th>
                <th className="text-right font-medium py-1.5 px-2">Min</th>
                <th className="text-right font-medium py-1.5 px-2">ORtg</th>
                <th className="text-right font-medium py-1.5 px-2">DRtg</th>
                <th className="text-right font-medium py-1.5 px-2">Net</th>
                <th className="text-right font-medium py-1.5 pl-2"><span className="sr-only">Lineup Lab</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border-theme/50 last:border-0">
                  <td className="py-1.5 pr-2 text-text-primary">{names(r)}</td>
                  <td className="py-1.5 px-2 text-right font-mono text-text-secondary">{fmtNum(r.minutes, 0)}{r.smallSample && <MinutesSampleTag className="ml-1" />}</td>
                  <td className="py-1.5 px-2 text-right font-mono text-text-secondary">{fmtNum(r.offRtg)}</td>
                  <td className="py-1.5 px-2 text-right font-mono text-text-secondary">{fmtNum(r.defRtg)}</td>
                  <td className={`py-1.5 px-2 text-right font-mono font-semibold ${tone(r.netRtg)}`}>{fmtSigned(r.netRtg)}</td>
                  <td className="py-1.5 pl-2 text-right"><Link href={labHref(r)} className="text-xs underline text-text-muted hover:text-text-primary">Lab</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function LineupsWithout({ data, first }: { data: StarOffData; first: string }) {
  const g = data.groups;
  if (!g || data.split?.off.error) return null;
  const why = `Need ${SMALL_SAMPLE_MINUTES}+ minutes without ${first}.`;
  return (
    <Section
      title={`Lineups without ${first}`}
      subtitle={`Pairs and trios: minutes together with ${first} off the floor (${SMALL_SAMPLE_MINUTES}+ minutes). Five-man lineups that don't include him, most used first. "Lab" opens the group in Lineup Lab.`}
    >
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <GroupTable title="Best pairs" rows={g.bestPairs} players={data.players} empty={why} />
        <GroupTable title="Worst pairs" rows={g.worstPairs} players={data.players} empty="Not enough pairs to show a bottom group." />
        <GroupTable title="Best trios" rows={g.bestTrios} players={data.players} empty={why} />
        <GroupTable title="Most-used five-man lineups" rows={g.topFives} players={data.players} empty={`No five-man lineup has played without ${first}.`} />
      </div>
      <p className="mt-3 text-xs text-text-faint">
        Lab links set {first} off the floor where the Lab allows it (five players at most, on and off together).
      </p>
    </Section>
  );
}

// ── Games the star missed ────────────────────────────────────────────────────

function SetCard({ title, s, emphasis }: { title: string; s: GameSetSummary; emphasis?: boolean }) {
  return (
    <div className={`rounded-xl p-3 min-w-0 ${emphasis ? "bg-lakers-purple/10" : "bg-input/60"}`}>
      <p className="text-xs uppercase tracking-wider text-text-muted">{title}</p>
      <p className="text-2xl font-bold font-mono text-text-primary mt-1">{s.games ? `${s.wins}–${s.losses}` : DASH}</p>
      <dl className="mt-1 grid grid-cols-4 gap-2 text-xs">
        {([["ORtg", fmtNum(s.offRtg)], ["DRtg", fmtNum(s.defRtg)], ["Net", fmtSigned(s.netRtg)], ["Pace", fmtNum(s.pace)]] as const).map(([k, v]) => (
          <div key={k}>
            <dt className="text-text-faint">{k}</dt>
            <dd className={`font-mono ${k === "Net" ? tone(s.netRtg) : "text-text-secondary"}`}>{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function Pair({ without, withV, fmt }: { without: number | null | undefined; withV: number | null | undefined; fmt: (v: number | null) => string }) {
  return (
    <>
      <span className="font-mono text-text-primary">{fmt(without ?? null)}</span>
      <span className="block font-mono text-[11px] text-text-faint">{withV == null ? DASH : fmt(withV)}</span>
    </>
  );
}

function MissedGames({ data, first }: { data: StarOffData; first: string }) {
  const m = data.missed;
  const title = `Games ${first} missed`;
  if (!m.starPlayed) return <Section title={title}><EmptyState>{first} hasn&apos;t played a game for the team this season.</EmptyState></Section>;
  if (!m.withoutStar.games) {
    return (
      <Section title={title}>
        <EmptyState>{first} has played every game since his first one for the team ({m.withStar.games} straight).</EmptyState>
      </Section>
    );
  }
  const standIns = m.standIns.filter((s) => (s.startRateWith ?? 0) < 0.5);
  const one = (v: number | null) => fmtNum(v);

  return (
    <Section
      title={title}
      subtitle={`Whole games without him, from game logs. Ratings and pace are box-score estimates per game.`}
      action={m.smallSample ? <span className="flex items-center gap-1 text-xs text-text-muted">{m.withoutStar.games} game{m.withoutStar.games === 1 ? "" : "s"}<SmallSampleTag /></span> : undefined}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
        <SetCard title={`Without ${first}`} s={m.withoutStar} emphasis />
        <SetCard title={`With ${first}`} s={m.withStar} />
      </div>
      {m.smallSample && (
        <p className="mb-4 text-xs text-text-muted">Fewer than {MISSED_GAMES_SMALL_SAMPLE} games without him — read these as a few results, not a trend.</p>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-6">
        <div className="min-w-0">
          <h4 className="text-sm font-semibold text-text-primary mb-1">Teammates&apos; per-game lines</h4>
          <p className="text-xs text-text-muted mb-2">Top: games {first} missed. Below, faint: games he played.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
              <thead>
                <tr className="text-xs uppercase tracking-wider text-text-muted border-b border-border-theme">
                  <th className="text-left font-medium py-2 pr-2">Player</th>
                  <th className="text-right font-medium py-2 px-2" title="Games played without / with him">GP</th>
                  <th className="text-right font-medium py-2 px-2">MIN</th>
                  <th className="text-right font-medium py-2 px-2">PTS</th>
                  <th className="text-right font-medium py-2 px-2">REB</th>
                  <th className="text-right font-medium py-2 px-2">AST</th>
                  <th className="text-right font-medium py-2 px-2" title="PTS / (2·(FGA + 0.44·FTA))">TS%</th>
                  <th className="text-right font-medium py-2 pl-2" title="Box-score usage estimate: share of team plays used on the floor">USG%</th>
                </tr>
              </thead>
              <tbody>
                {m.teammates.map((t) => (
                  <tr key={t.playerId} className="border-b border-border-theme/50 last:border-0 align-top">
                    <td className="py-1.5 pr-2"><Who p={data.players[t.playerId]} /></td>
                    <td className="py-1.5 px-2 text-right font-mono text-text-secondary">{t.gamesWithout}<span className="block text-[11px] text-text-faint">{t.gamesWith}</span></td>
                    <td className="py-1.5 px-2 text-right"><Pair without={t.without?.min} withV={t.with?.min} fmt={one} /></td>
                    <td className="py-1.5 px-2 text-right"><Pair without={t.without?.pts} withV={t.with?.pts} fmt={one} /></td>
                    <td className="py-1.5 px-2 text-right"><Pair without={t.without?.reb} withV={t.with?.reb} fmt={one} /></td>
                    <td className="py-1.5 px-2 text-right"><Pair without={t.without?.ast} withV={t.with?.ast} fmt={one} /></td>
                    <td className="py-1.5 px-2 text-right"><Pair without={t.without?.tsPct} withV={t.with?.tsPct} fmt={fmtPct} /></td>
                    <td className="py-1.5 pl-2 text-right"><Pair without={t.without?.usgPct} withV={t.with?.usgPct} fmt={fmtPct} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-5 min-w-0">
          <div>
            <h4 className="text-sm font-semibold text-text-primary mb-1">Who started in his place</h4>
            {standIns.length ? (
              <ul className="space-y-1.5">
                {standIns.map((s) => (
                  <li key={s.playerId} className="flex items-center justify-between gap-2 text-sm">
                    <Who p={data.players[s.playerId]} />
                    <span className="shrink-0 text-xs text-text-muted font-mono">
                      {s.startsWithout} start{s.startsWithout === 1 ? "" : "s"} · {s.startRateWith == null ? DASH : fmtPct(s.startRateWith, 0)} with him
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-text-muted">No change: the usual starters started.</p>
            )}
            <p className="mt-1 text-xs text-text-faint">Players who started without him but started under half the games he played.</p>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-text-primary mb-1">The games</h4>
            <ul className="space-y-1">
              {m.games.map((g) => (
                <li key={g.gameId} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-text-secondary">
                    {format(gameDay(g.gameDate), "MMM d")} {g.isHome ? "vs" : "@"} {g.opponent.abbreviation}
                  </span>
                  <span className={`font-mono ${g.won ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                    {g.won ? "W" : "L"} {g.teamPts}–{g.oppPts}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </Section>
  );
}

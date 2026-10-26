"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { format } from "date-fns";
import { useMatchup } from "@/lib/hooks/useDashboard";
import { PlayerAvatar } from "./PlayerAvatar";
import { useThemeColors } from "@/lib/ThemeContext";
import { fmtNum, fmtPct, fmtSigned, gameDay, ordinal } from "@/lib/format";
import { PageSkeleton } from "@/components/ui/LoadingSkeleton";
import { ErrorDisplay } from "@/components/ui/ErrorDisplay";
import { DataNotes, EmptyState, FormStrip, InjuryTag, METRIC_META, Section, SmallSampleTag, StatusBadge, TrendArrow, WindowToggle, fmtMetric, type Window } from "./primitives";
import type { FactorEdge, KeyPlayerView, MatchupData, RankedMetric, TeamSnapshot } from "@/lib/dashboard-types";


const TAPE: RankedMetric[] = [
  "netRtg", "offRtg", "defRtg", "pace",
  "efgPct", "tovPct", "orebPct", "ftRate", "threePaRate", "threePct",
  "oppEfgPct", "oppTovPct", "oppOrebPct", "oppFtRate", "oppThreePct",
];

export function MatchupDashboard() {
  const params = useSearchParams();
  const router = useRouter();
  const opponent = params.get("opponent") ?? undefined;
  const { data, isLoading, error, isFetching } = useMatchup(opponent);
  const [win, setWin] = useState<Window>("season");

  if (isLoading) return <PageSkeleton />;
  if (error || !data) return <ErrorDisplay title="Matchup unavailable" message={error?.message ?? "Could not load matchup data."} />;

  const us = data.us.team;
  const them = data.them.team;

  return (
    <div className={`space-y-6 transition-opacity ${isFetching ? "opacity-60" : ""}`}>
      <DataNotes notes={data.dataNotes} />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wider text-text-faint">{data.season.displayName} · Opponent scouting</p>
          <h1 className="text-3xl font-bold text-heading">
            {us.nickname} <span className="text-text-faint font-normal">vs</span> {them.nickname}
          </h1>
        </div>
        <label className="flex flex-col gap-1 text-xs text-text-muted">
          Opponent
          <select
            value={them.id}
            onChange={(e) => router.replace(`/matchup?opponent=${e.target.value}`, { scroll: false })}
            className="bg-input border border-border-theme rounded-lg px-3 py-2 text-sm text-text-primary min-w-64"
          >
            <optgroup label="Upcoming (by date)">
              {data.opponentOptions.filter((o) => o.nextMeetingUtc).map((o) => (
                <option key={o.team.id} value={o.team.id}>
                  {format(new Date(o.nextMeetingUtc!), "MMM d")} — {o.team.name}
                </option>
              ))}
            </optgroup>
            <optgroup label="All teams">
              {data.opponentOptions.filter((o) => !o.nextMeetingUtc).map((o) => (
                <option key={o.team.id} value={o.team.id}>{o.team.name}</option>
              ))}
            </optgroup>
          </select>
        </label>
      </div>

      <GameCard data={data} />

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        <Section
          className="xl:col-span-3"
          title="Tale of the tape"
          subtitle={`Bars show league rank (longer = better, out of ${data.league?.teams ?? 30}). Box-score estimates.`}
          action={<WindowToggle value={win} onChange={setWin} />}
        >
          <TaleOfTape us={data.us} them={data.them} win={win} />
        </Section>
        <Section className="xl:col-span-2" title="Where the game is won" subtitle={`Four factors: our rank vs their rank in the matching category (season)`}>
          <Edges edges={data.edges} usAbbr={us.abbreviation} themAbbr={them.abbreviation} />
        </Section>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Section title={`${them.nickname} key players`} subtitle="Top of the rotation by minutes · last-5 scoring trend">
          <KeyPlayers players={data.keyPlayers.theirs} />
        </Section>
        <Section title={`${us.nickname} key players`} subtitle="Top of the rotation by minutes · last-5 scoring trend">
          <KeyPlayers players={data.keyPlayers.ours} />
        </Section>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Section title="Recent form" subtitle="Last 10 games, oldest → newest">
          <div className="space-y-4">
            <FormRow label={us.abbreviation} games={data.recentForm.ours} />
            <FormRow label={them.abbreviation} games={data.recentForm.theirs} />
          </div>
        </Section>
        <Section title="Head to head" subtitle={`${data.season.id} and ${data.season.previous}`}>
          {data.headToHead.length ? (
            <ul className="divide-y divide-border-theme/60">
              {data.headToHead.map((g) => (
                <li key={g.gameId} className="flex justify-between py-2 text-sm">
                  <span className="text-text-muted">{format(gameDay(g.date), "MMM d, yyyy")} · {g.homeAway === "HOME" ? "home" : "away"}</span>
                  <span className={`font-mono font-semibold ${g.result === "W" ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"}`}>
                    {g.result} {g.points}-{g.oppPoints}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState>No meetings in the last two seasons.</EmptyState>
          )}
        </Section>
        <Section title="Availability" subtitle={data.injuriesFetchedAt ? `Unofficial report · fetched ${format(new Date(data.injuriesFetchedAt), "PPp")}` : "No injury report loaded"}>
          <Injuries data={data} />
        </Section>
      </div>

      <p className="text-xs text-text-faint">
        The projection is a simple efficiency model (regressed ratings × expected pace, ±1 pt home court, σ = 12) — an estimate, not a prediction.
        See <Link href="/" className="underline">the dashboard</Link> for full Lakers detail.
      </p>
    </div>
  );
}

function GameCard({ data }: { data: MatchupData }) {
  const c = useThemeColors();
  const { game, projection, us, them } = data;
  const prob = projection?.ourWinProb ?? null;
  return (
    <div className="glass-card p-5 md:p-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
        <TeamBlock snap={us} color={c.us} />
        <div className="text-center order-first md:order-none">
          {game ? (
            <>
              <p className="text-xs uppercase tracking-wider text-text-faint">{game.homeAway === "HOME" ? "Home" : "Away"} · next meeting</p>
              <p className="text-lg font-semibold text-text-primary">{format(new Date(game.dateUtc), "EEE MMM d · p")}</p>
              <p className="text-xs text-text-muted">{[game.arena, game.nationalTv].filter(Boolean).join(" · ")}</p>
            </>
          ) : (
            <p className="text-sm text-text-muted">No meeting scheduled · neutral-court estimate</p>
          )}
          {projection && prob != null ? (
            <div className="mt-4">
              <p className="text-3xl font-bold font-mono text-text-primary">
                {Math.round(projection.ourPoints)}<span className="text-text-faint mx-2">–</span>{Math.round(projection.theirPoints)}
              </p>
              <p className="text-xs text-text-muted">
                Estimated score · pace {fmtNum(projection.pace)} {projection.smallSample && <SmallSampleTag className="ml-1" />}
              </p>
              <div className="mt-3" aria-label={`Win probability: ${us.team.abbreviation} ${fmtPct(prob, 0)}, ${them.team.abbreviation} ${fmtPct(1 - prob, 0)}`}>
                <div className="flex h-3 rounded-full overflow-hidden gap-0.5">
                  <div style={{ width: `${prob * 100}%`, backgroundColor: c.us }} />
                  <div style={{ width: `${(1 - prob) * 100}%`, backgroundColor: c.them }} />
                </div>
                <div className="flex justify-between text-xs mt-1 font-mono text-text-secondary">
                  <span>{us.team.abbreviation} {fmtPct(prob, 0)}</span>
                  <span>{fmtPct(1 - prob, 0)} {them.team.abbreviation}</span>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-xs text-text-faint mt-3">Projection needs at least one game from each team.</p>
          )}
        </div>
        <TeamBlock snap={them} color={c.them} align="right" />
      </div>
    </div>
  );
}

function TeamBlock({ snap, color, align = "left" }: { snap: TeamSnapshot; color: string; align?: "left" | "right" }) {
  const s = snap.season;
  const st = snap.standing;
  return (
    <div className={align === "right" ? "md:text-right" : ""}>
      <div className={`flex items-center gap-2 ${align === "right" ? "md:justify-end" : ""}`}>
        <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: color }} aria-hidden />
        <h2 className="text-2xl font-bold text-text-primary">{snap.team.name}</h2>
      </div>
      <p className="text-sm text-text-muted mt-1">
        {s ? `${s.wins}-${s.losses}` : "0-0"} · {ordinal(st?.conferenceRank)} in {snap.team.conference === "WEST" ? "West" : "East"}
        {st?.streak && ` · ${st.streak}`}
      </p>
      <p className="text-sm text-text-muted">
        Net rating <span className="font-mono text-text-primary">{fmtSigned(s?.metrics.netRtg.value)}</span>
        {s?.metrics.netRtg.rank != null && <span className="text-text-faint"> ({ordinal(s.metrics.netRtg.rank)})</span>}
      </p>
    </div>
  );
}

function TaleOfTape({ us, them, win }: { us: TeamSnapshot; them: TeamSnapshot; win: Window }) {
  const c = useThemeColors();
  const a = win === "season" ? us.season : us.last10;
  const b = win === "season" ? them.season : them.last10;
  if (!a || !b) return <EmptyState>Both teams need at least one game.</EmptyState>;
  const bar = (rank: number | null) => (rank == null ? 0 : ((31 - rank) / 30) * 100);
  return (
    <div className="relative overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs uppercase tracking-wider text-text-muted border-b border-border-theme">
            <th className="py-2 text-right font-medium w-[30%]">{us.team.abbreviation}</th>
            <th className="py-2 text-center font-medium">Metric</th>
            <th className="py-2 text-left font-medium w-[30%]">{them.team.abbreviation}</th>
          </tr>
        </thead>
        <tbody>
          {TAPE.map((m) => {
            const ra = a.metrics[m].rank;
            const rb = b.metrics[m].rank;
            const better = ra != null && rb != null && ra !== rb ? (ra < rb ? "us" : "them") : null;
            return (
              <tr key={m} className="border-b border-border-theme/50" title={METRIC_META[m].help}>
                <td className="py-1.5">
                  <div className="flex items-center justify-end gap-2">
                    <span className={`font-mono tabular-nums ${better === "us" ? "text-text-primary font-semibold" : "text-text-muted"}`}>
                      {fmtMetric(m, a.metrics[m].value)}
                    </span>
                    <span className="text-[10px] font-mono text-text-faint w-8 text-right">{ordinal(ra)}</span>
                    <span className="hidden sm:block w-20 h-2 rounded-full bg-bar-bg overflow-hidden" aria-hidden>
                      <span className="block h-full rounded-full ml-auto" style={{ width: `${bar(ra)}%`, backgroundColor: c.us }} />
                    </span>
                  </div>
                </td>
                <td className="py-1.5 px-2 text-center text-xs text-text-secondary whitespace-nowrap">{METRIC_META[m].label}</td>
                <td className="py-1.5">
                  <div className="flex items-center gap-2">
                    <span className="hidden sm:block w-20 h-2 rounded-full bg-bar-bg overflow-hidden" aria-hidden>
                      <span className="block h-full rounded-full" style={{ width: `${bar(rb)}%`, backgroundColor: c.them }} />
                    </span>
                    <span className="text-[10px] font-mono text-text-faint w-8">{ordinal(rb)}</span>
                    <span className={`font-mono tabular-nums ${better === "them" ? "text-text-primary font-semibold" : "text-text-muted"}`}>
                      {fmtMetric(m, b.metrics[m].value)}
                    </span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const VERDICT_STYLE = {
  advantage: { icon: "▲", label: "Edge", cls: "bg-green-500/15 text-green-600 dark:text-green-400" },
  even: { icon: "=", label: "Even", cls: "bg-input text-text-muted" },
  disadvantage: { icon: "▼", label: "Watch", cls: "bg-red-500/15 text-red-500 dark:text-red-400" },
} as const;

function Edges({ edges, usAbbr, themAbbr }: { edges: FactorEdge[]; usAbbr: string; themAbbr: string }) {
  if (!edges.length) return <EmptyState>Edges appear once both teams have played.</EmptyState>;
  return (
    <div className="space-y-5">
      {(["offense", "defense"] as const).map((side) => (
        <div key={side}>
          <p className="text-xs uppercase tracking-wider text-text-muted mb-2">
            {side === "offense" ? `${usAbbr} offense vs ${themAbbr} defense` : `${usAbbr} defense vs ${themAbbr} offense`}
          </p>
          <ul className="space-y-2">
            {edges.filter((e) => e.side === side).map((e) => {
              const v = e.verdict ? VERDICT_STYLE[e.verdict] : null;
              return (
                <li key={e.factor} className="flex items-center gap-3">
                  <span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase w-16 justify-center ${v?.cls ?? "bg-input text-text-faint"}`}>
                    <span aria-hidden>{v?.icon ?? "?"}</span>
                    {v?.label ?? "n/a"}
                  </span>
                  <span className="flex-1 min-w-0 text-sm">
                    <span className="text-text-primary">{e.label}</span>
                    <span className="block text-xs text-text-muted">
                      {usAbbr} {METRIC_META[e.ours.metric].short} {fmtMetric(e.ours.metric, e.ours.value)} ({ordinal(e.ours.rank)}) · {themAbbr}{" "}
                      {METRIC_META[e.theirs.metric].short} {fmtMetric(e.theirs.metric, e.theirs.value)} ({ordinal(e.theirs.rank)})
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

function KeyPlayers({ players }: { players: KeyPlayerView[] }) {
  if (!players.length) return <EmptyState>No roster loaded for this team.</EmptyState>;
  return (
    <div className="relative overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs uppercase tracking-wider text-text-muted border-b border-border-theme">
            <th className="text-left py-2 font-medium">Player</th>
            <th className="text-right py-2 px-1.5 font-medium" title="Minutes per game">MIN</th>
            <th className="text-right py-2 px-1.5 font-medium">PTS</th>
            <th className="text-right py-2 px-1.5 font-medium">REB</th>
            <th className="text-right py-2 px-1.5 font-medium">AST</th>
            <th className="text-right py-2 px-1.5 font-medium">TS%</th>
            <th className="text-right py-2 px-1.5 font-medium" title="Last 5 games points">L5</th>
            <th className="py-2 pl-1"><span className="sr-only">Trend</span></th>
          </tr>
        </thead>
        <tbody>
          {players.map((p) => {
            // Small sample → show last season's line, labelled
            const useBaseline = (!p.current || p.smallSample) && p.baseline;
            const line = useBaseline ? p.baseline : p.current;
            return (
              <tr key={p.player.id} className="border-b border-border-theme/50">
                <td className="py-2 pr-2">
                  <PlayerAvatar name={p.player.fullName} headshotUrl={p.player.headshotUrl} size={26} />
                  <Link href={`/players/${p.player.id}`} className="ml-2 align-middle font-medium text-text-primary hover:text-heading whitespace-nowrap">{p.player.fullName}</Link>
                  <span className="ml-1.5 inline-flex flex-wrap gap-1 align-middle">
                    {p.status !== "returning" && <StatusBadge status={p.status} />}
                    <InjuryTag injury={p.injury} />
                  </span>
                  {useBaseline && line && (
                    <span className="block text-[10px] text-text-faint">{line.season}{line.teamAbbr ? ` w/ ${line.teamAbbr}` : ""} line (small sample this season)</span>
                  )}
                </td>
                <td className="py-2 px-1.5 text-right font-mono tabular-nums text-text-secondary">{fmtNum(line?.minutes)}</td>
                <td className="py-2 px-1.5 text-right font-mono tabular-nums text-text-primary">{fmtNum(line?.points)}</td>
                <td className="py-2 px-1.5 text-right font-mono tabular-nums text-text-secondary">{fmtNum(line?.rebounds)}</td>
                <td className="py-2 px-1.5 text-right font-mono tabular-nums text-text-secondary">{fmtNum(line?.assists)}</td>
                <td className="py-2 px-1.5 text-right font-mono tabular-nums text-text-secondary">{fmtPct(line?.tsPct)}</td>
                <td className="py-2 px-1.5 text-right font-mono tabular-nums text-text-secondary">{fmtNum(p.last5.points)}</td>
                <td className="py-2 pl-1"><TrendArrow trend={p.pointsTrend} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function FormRow({ label, games }: { label: string; games: MatchupData["recentForm"]["ours"] }) {
  const w = games.filter((g) => g.result === "W").length;
  const margin = games.length ? games.reduce((a, g) => a + g.points - g.oppPoints, 0) / games.length : null;
  return (
    <div>
      <div className="flex justify-between text-xs text-text-muted mb-1">
        <span className="font-semibold text-text-primary">{label}</span>
        <span className="font-mono">{w}-{games.length - w} · {fmtSigned(margin)} avg</span>
      </div>
      <FormStrip games={games} />
    </div>
  );
}

function Injuries({ data }: { data: MatchupData }) {
  if (!data.injuriesFetchedAt) return <EmptyState>Run the ETL with injuries enabled to see availability.</EmptyState>;
  const rows = [
    ...data.injuries.theirs.map((i) => ({ ...i, abbr: data.them.team.abbreviation })),
    ...data.injuries.ours.map((i) => ({ ...i, abbr: data.us.team.abbreviation })),
  ];
  if (!rows.length) return <EmptyState>No players listed for either team.</EmptyState>;
  return (
    <ul className="space-y-2">
      {rows.map((i) => (
        <li key={`${i.teamId}-${i.playerName}`} className="text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="text-text-primary">
              {i.playerId ? <Link href={`/players/${i.playerId}`} className="hover:text-heading">{i.playerName}</Link> : i.playerName}{" "}
              <span className="text-xs text-text-faint">{i.abbr}</span>
            </span>
            <InjuryTag injury={i} />
          </div>
          {(i.detail || i.returnDate) && (
            <p className="text-xs text-text-muted">
              {i.detail}
              {i.returnDate && ` · est. return ${format(new Date(i.returnDate), "MMM d")}`}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

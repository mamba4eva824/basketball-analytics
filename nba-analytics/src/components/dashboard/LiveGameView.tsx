"use client";
import { useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { useLiveGame } from "@/lib/hooks/useLiveGame";
import { useSchedule } from "@/lib/hooks/useSchedule";
import { useThemeColors } from "@/lib/ThemeContext";
import { fmtNum, fmtPct, fmtSigned, gameDay } from "@/lib/format";
import { periodLabel } from "@/lib/analytics/live";
import { PageSkeleton } from "@/components/ui/LoadingSkeleton";
import { ErrorDisplay } from "@/components/ui/ErrorDisplay";
import { TeamLogo } from "@/components/ui/TeamLogo";
import { StatCard } from "@/components/layout/StatCard";
import { COURT_H, COURT_W, HalfCourtLines, courtX, courtY } from "@/components/charts/HalfCourt";
import { GameFlowChart } from "./GameFlowChart";
import { PlayerAvatar } from "./PlayerAvatar";
import { DataNotes, EmptyState, Section } from "./primitives";
import type {
  LiveGameData,
  LivePlayerLine,
  LivePregameView,
  LiveShot,
  LiveTeamFactors,
  LiveTeamView,
  UpcomingGameView,
} from "@/lib/dashboard-types";

/**
 * In-game tracking from the NBA live feed: today's Lakers game by default (polled every 15 s while
 * live), or any earlier game picked from the schedule, replayed from its final feed.
 */
export function LiveGameView({ gameId, onSelectGame }: { gameId?: string; onSelectGame: (gameId: string | null) => void }) {
  return (
    <div className="space-y-4">
      <GamePicker gameId={gameId} onSelect={onSelectGame} />
      <LiveGameBody gameId={gameId} />
    </div>
  );
}

function LiveGameBody({ gameId }: { gameId?: string }) {
  const { data, isLoading, error, isFetching, dataUpdatedAt, refetch } = useLiveGame(gameId);

  if (isLoading) return <PageSkeleton />;
  if (error || !data) {
    return (
      <ErrorDisplay
        title={gameId ? "Game unavailable" : "Live feed unavailable"}
        message={`${error?.message ?? "Could not reach the NBA live feed."} The feed only answers from a home connection, not a cloud host.`}
        onRetry={() => refetch()}
      />
    );
  }
  if (data.kind === "none") return <NoGameToday next={data.next} />;
  if (data.kind === "pregame") return <Pregame game={data.pregame} />;
  return <LiveGame game={data.game} updatedAt={dataUpdatedAt} refreshing={isFetching} />;
}

/** Today's game (live) or any finished Lakers game this season, newest first. */
function GamePicker({ gameId, onSelect }: { gameId?: string; onSelect: (gameId: string | null) => void }) {
  const { data } = useSchedule();
  const past = (data?.games ?? []).filter((g) => g.state === "final" || g.state === "pending").reverse();
  if (!past.length) return null;
  return (
    <label className="flex flex-wrap items-center gap-2 text-xs text-text-muted">
      Game
      <select
        value={gameId ?? ""}
        onChange={(e) => onSelect(e.target.value || null)}
        className="bg-input border border-border-theme rounded-lg px-3 py-2 text-sm text-text-primary min-w-64"
      >
        <option value="">Today&apos;s game (live)</option>
        {past.map((g) => (
          <option key={g.gameId} value={g.gameId}>
            {format(gameDay(g.dateEt), "EEE MMM d")} · {g.homeAway === "HOME" ? "vs" : "@"} {g.opponent.abbreviation}
            {g.result ? ` · ${g.result} ${g.points}-${g.oppPoints}` : ""}
          </option>
        ))}
      </select>
      {gameId && <span className="text-text-faint">Replaying the final feed — play-by-play, shots and box score as they ended</span>}
    </label>
  );
}

// ── No game / pre-game ───────────────────────────────────────────────────────

function NoGameToday({ next }: { next: UpcomingGameView | null }) {
  return (
    <Section title="No Lakers game today">
      <EmptyState>
        {next
          ? <>Next up: {next.homeAway === "HOME" ? "vs" : "@"} {next.opponent.name}, {format(new Date(next.dateUtc), "EEE MMM d · h:mm a")}. This view goes live at tip-off.</>
          : "No upcoming game on the schedule."}
      </EmptyState>
    </Section>
  );
}

function Pregame({ game }: { game: LivePregameView }) {
  const sep = game.isHome ? "vs" : "@";
  return (
    <Section title="Not started yet" subtitle="Checks for tip-off every minute">
      <div className="flex flex-wrap items-center justify-center gap-6 py-6">
        <PregameTeam t={game.focus} />
        <span className="text-text-faint text-lg">{sep}</span>
        <PregameTeam t={game.opponent} />
      </div>
      <p className="text-center text-sm text-text-muted">
        Tip-off {format(new Date(game.tipoffUtc), "EEE MMM d · h:mm a")} · {game.statusText}
      </p>
    </Section>
  );
}

function PregameTeam({ t }: { t: LivePregameView["focus"] }) {
  return (
    <div className="flex items-center gap-3">
      <TeamLogo abbreviation={t.tricode} size="lg" />
      <div>
        <p className="font-semibold text-text-primary">{t.city} {t.name}</p>
        <p className="text-xs text-text-muted">{t.wins}-{t.losses}</p>
      </div>
    </div>
  );
}

// ── Live / final ─────────────────────────────────────────────────────────────

function LiveGame({ game, updatedAt, refreshing }: { game: LiveGameData; updatedAt: number; refreshing: boolean }) {
  const c = useThemeColors();
  const us = game.focus;
  const them = game.opponent;
  const poss = game.gamePossessions;
  const notes = [
    `Ratings and four factors are box-score estimates over ${poss != null ? Math.round(poss) : "—"} possessions so far. Single-game numbers swing fast.`,
  ];

  return (
    <div className="space-y-6">
      <Scoreboard game={game} updatedAt={updatedAt} refreshing={refreshing} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label={game.status === 3 ? "Closing run" : "Current run"}
          value={game.run ? `${game.run.tricode} ${game.run.points}–0` : "—"}
          subtitle={game.run ? `Unanswered since ${game.run.since}` : "No scoring yet"}
          valueClassName={TILE_VALUE}
          valueStyle={game.run ? { color: game.run.tricode === us.tricode ? c.us : c.them } : undefined}
        />
        <StatCard
          label="Biggest lead"
          value={`${us.tricode} ${us.biggestLead} · ${them.tricode} ${them.biggestLead}`}
          subtitle={`Longest unanswered run: ${us.tricode} ${us.longestRun}, ${them.tricode} ${them.longestRun}`}
          valueClassName={TILE_VALUE}
        />
        <StatCard
          label="Lead changes · ties"
          value={`${game.leadChanges} · ${game.timesTied}`}
          subtitle={`Time leading: ${us.tricode} ${mmss(us.timeLeadingSec)}, ${them.tricode} ${mmss(them.timeLeadingSec)}`}
          valueClassName={TILE_VALUE}
        />
        <StatCard
          label="Possessions"
          value={fmtNum(poss)}
          subtitle={`ORtg ${us.tricode} ${fmtNum(us.factors.offRtg)} · ${them.tricode} ${fmtNum(them.factors.offRtg)}`}
          valueClassName={TILE_VALUE}
          title="FGA + 0.44·FTA − OREB + TOV, mean of both teams. ORtg = points per 100 of them."
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Section title="Game flow" subtitle={`Score margin after every basket (${us.tricode} − ${them.tricode})`}>
          <GameFlowChart data={game.margin} elapsedSec={game.elapsedSec} regulation={game.regulationPeriods} us={us.tricode} them={them.tricode} />
        </Section>
        <Section title="Four factors, tonight" subtitle="Highlighted side is winning that factor">
          <FactorTable us={us} them={them} />
        </Section>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Section title="On the floor" subtitle={game.status === 2 ? "Current five and their stint margin" : "Game over"} className="xl:col-span-2">
          {game.status === 2
            ? <div className="grid grid-cols-1 md:grid-cols-2 gap-4"><OnFloor team={us} /><OnFloor team={them} /></div>
            : <EmptyState>Final — no one on the floor.</EmptyState>}
        </Section>
        <Section title="Watch list" subtitle="Foul trouble, bonus and timeouts">
          <WatchList game={game} />
        </Section>
      </div>

      <Section title="Where the points come from">
        <ScoringSplit us={us} them={them} />
      </Section>

      <BoxScores us={us} them={them} />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <ShotMap shots={game.shots} us={us.tricode} them={them.tricode} />
        <Section title="Play-by-play" subtitle="Latest 15 plays">
          <PlayFeed game={game} />
        </Section>
      </div>

      <DataNotes notes={notes} />
    </div>
  );
}

/** Momentum values like "LAL 6 · UTA 18" need to wrap on phones */
const TILE_VALUE = "text-lg md:text-xl";

function mmss(sec: number): string {
  // round once, then split, so 299.6 s reads 5:00 rather than 4:60
  const total = Math.round(sec);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function minutesLabel(min: number): string {
  return mmss(min * 60);
}

// ── Scoreboard ───────────────────────────────────────────────────────────────

function Scoreboard({ game, updatedAt, refreshing }: { game: LiveGameData; updatedAt: number; refreshing: boolean }) {
  const away = game.focus.isHome ? game.opponent : game.focus;
  const home = game.focus.isHome ? game.focus : game.opponent;
  const periods = Math.max(game.regulationPeriods, away.periods.length, home.periods.length);
  const live = game.status === 2;

  return (
    <section className="glass-card p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4 text-xs">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold uppercase tracking-wide ${live ? "bg-red-500/15 text-red-500" : "bg-input text-text-secondary"}`}>
          {live && <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" aria-hidden />}
          {live ? "Live" : game.statusText}
        </span>
        <span className="text-text-faint">
          {game.arena && <>{game.arena} · </>}
          Updated {format(new Date(updatedAt), "h:mm:ss a")}
          {live && " · refreshes every 15 s"}
          {refreshing && " · refreshing…"}
        </span>
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 md:gap-6">
        <ScoreSide team={away} align="left" />
        <div className="text-center">
          <p className="text-sm font-semibold text-text-primary">
            {live && game.clock ? `${periodLabel(game.period, game.regulationPeriods)} ${game.clock}` : game.statusText}
          </p>
          <p className="text-xs text-text-faint">@</p>
        </div>
        <ScoreSide team={home} align="right" />
      </div>

      <div className="relative overflow-x-auto mt-4">
        <table className="w-full max-w-md mx-auto text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wider text-text-muted border-b border-border-theme">
              <th className="py-1.5 text-left font-medium">Team</th>
              {Array.from({ length: periods }, (_, i) => (
                <th key={i} className="py-1.5 px-2 text-right font-medium">{periodLabel(i + 1, game.regulationPeriods)}</th>
              ))}
              <th className="py-1.5 pl-2 text-right font-medium">T</th>
            </tr>
          </thead>
          <tbody>
            {[away, home].map((t) => (
              <tr key={t.teamId} className="border-b border-border-theme/50 last:border-0">
                <td className="py-1.5 font-semibold text-text-primary">{t.tricode}</td>
                {Array.from({ length: periods }, (_, i) => {
                  const played = i < game.period || game.status === 3;
                  return <td key={i} className="py-1.5 px-2 text-right font-mono text-text-secondary">{played ? t.periods[i] ?? 0 : "—"}</td>;
                })}
                <td className="py-1.5 pl-2 text-right font-mono font-bold text-text-primary">{t.score}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ScoreSide({ team, align }: { team: LiveTeamView; align: "left" | "right" }) {
  const right = align === "right";
  return (
    <div className={`flex items-center gap-3 min-w-0 ${right ? "flex-row-reverse text-right" : ""}`}>
      <TeamLogo abbreviation={team.tricode} size="lg" className="shrink-0" />
      <div className="hidden sm:block min-w-0">
        <p className="text-xs text-text-muted truncate">{team.city}</p>
        <p className="font-semibold text-text-primary truncate">{team.name}</p>
      </div>
      <p className={`text-4xl md:text-5xl font-bold font-mono ${right ? "mr-auto" : "ml-auto"} ${team.score > 0 ? "text-text-primary" : "text-text-faint"}`}>{team.score}</p>
    </div>
  );
}

// ── Tiles & tables ───────────────────────────────────────────────────────────

const FACTORS: { key: keyof LiveTeamFactors; label: string; help: string; lowerBetter?: boolean; signed?: boolean }[] = [
  { key: "offRtg", label: "Off. rating", help: "Points per 100 possessions (estimate)" },
  { key: "efgPct", label: "eFG%", help: "(FGM + 0.5·3PM) / FGA" },
  { key: "tovPct", label: "TOV%", help: "Turnovers per play (lower is better)", lowerBetter: true },
  { key: "orebPct", label: "OREB%", help: "Share of own misses rebounded" },
  { key: "ftRate", label: "FTA rate", help: "Free-throw attempts per FGA" },
  { key: "tsPct", label: "TS%", help: "PTS / (2·(FGA + 0.44·FTA))" },
  { key: "threePct", label: "3P%", help: "Three-point percentage" },
  { key: "threePaRate", label: "3PA rate", help: "Share of shots that are threes (style, not better/worse)" },
];

function FactorTable({ us, them }: { us: LiveTeamView; them: LiveTeamView }) {
  return (
    <div className="relative overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs uppercase tracking-wider text-text-muted border-b border-border-theme">
            <th className="py-2 text-right font-medium w-[30%]">{us.tricode}</th>
            <th className="py-2 text-center font-medium">Factor</th>
            <th className="py-2 text-left font-medium w-[30%]">{them.tricode}</th>
          </tr>
        </thead>
        <tbody>
          {FACTORS.map((f) => {
            const a = us.factors[f.key];
            const b = them.factors[f.key];
            const fmt = f.key === "offRtg" ? fmtNum : fmtPct;
            const neutral = f.key === "threePaRate";
            const better = a != null && b != null && a !== b && !neutral ? ((f.lowerBetter ? a < b : a > b) ? "us" : "them") : null;
            return (
              <tr key={f.key} className="border-b border-border-theme/50 last:border-0">
                <td className={`py-2 text-right font-mono ${better === "us" ? "font-bold text-heading" : "text-text-secondary"}`}>{fmt(a)}</td>
                <td className="py-2 text-center text-xs text-text-muted" title={f.help}>{f.label}</td>
                <td className={`py-2 text-left font-mono ${better === "them" ? "font-bold text-heading" : "text-text-secondary"}`}>{fmt(b)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function OnFloor({ team }: { team: LiveTeamView }) {
  const five = team.players.filter((p) => p.onCourt);
  const st = team.lineup;
  const net = st ? st.pointsFor - st.pointsAgainst : null;
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <p className="text-sm font-semibold text-text-primary">{team.tricode}</p>
        {st && (
          <p className="text-xs text-text-muted" title="Points for–against since this five came together (or since the period started)">
            {st.pointsFor}–{st.pointsAgainst} <span className={net! > 0 ? "text-green-500" : net! < 0 ? "text-red-400" : ""}>({fmtSigned(net, 0)})</span> in {mmss(st.seconds)} · since {st.since}
          </p>
        )}
      </div>
      <ul className="space-y-1.5">
        {five.map((p) => (
          <li key={p.personId} className="flex items-center gap-2 text-sm min-w-0">
            <PlayerAvatar name={p.name} headshotUrl={p.headshotUrl} size={28} />
            <Link href={`/players/${p.personId}`} className="truncate text-text-primary hover:text-heading">{p.name}</Link>
            <FoulBadge p={p} />
            <span className="ml-auto shrink-0 font-mono text-xs text-text-muted">
              {p.pts} pts · {p.reb} reb · {p.ast} ast · {p.pf} pf
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FoulBadge({ p }: { p: LivePlayerLine }) {
  if (!p.foul) return null;
  const out = p.foul === "fouled-out";
  return (
    <span
      className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${out ? "bg-red-500/15 text-red-500" : "bg-amber-500/15 text-amber-600 dark:text-amber-400"}`}
      title="Foul trouble = 2 fouls in Q1, 3 in Q2, 4 in Q3, 5 in Q4/OT"
    >
      {out ? "Fouled out" : `${p.pf} PF`}
    </span>
  );
}

function WatchList({ game }: { game: LiveGameData }) {
  const flagged = [game.focus, game.opponent].flatMap((t) => t.players.filter((p) => p.foul).map((p) => ({ p, t })));
  return (
    <div className="space-y-4 text-sm">
      <div>
        <p className="text-xs uppercase tracking-wider text-text-muted mb-1.5">Foul trouble</p>
        {flagged.length ? (
          <ul className="space-y-1">
            {flagged.map(({ p, t }) => (
              <li key={p.personId} className="flex items-center gap-2">
                <span className="text-xs font-semibold text-text-muted w-9">{t.tricode}</span>
                <span className="truncate text-text-primary">{p.name}</span>
                <FoulBadge p={p} />
                {p.onCourt && <span className="ml-auto text-[10px] uppercase text-text-faint">on floor</span>}
              </li>
            ))}
          </ul>
        ) : <p className="text-text-faint">No one yet.</p>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {[game.focus, game.opponent].map((t) => (
          <div key={t.teamId} className="rounded-lg bg-input px-3 py-2">
            <p className="text-xs font-semibold text-text-primary">{t.tricode}</p>
            <p className="text-xs text-text-muted">Timeouts left: <span className="font-mono text-text-primary">{t.timeoutsRemaining ?? "—"}</span></p>
            <p className="text-xs text-text-muted">In the bonus: <span className="text-text-primary">{t.inBonus == null ? "—" : t.inBonus ? "Yes" : "No"}</span></p>
            <p className="text-xs text-text-muted">Team fouls (game): <span className="font-mono text-text-primary">{t.totals.pf}</span></p>
          </div>
        ))}
      </div>
    </div>
  );
}

const SPLITS: { key: keyof LiveTeamView["scoring"]; label: string }[] = [
  { key: "paint", label: "Points in the paint" },
  { key: "secondChance", label: "Second-chance points" },
  { key: "fastBreak", label: "Fast-break points" },
  { key: "offTurnovers", label: "Points off turnovers" },
  { key: "bench", label: "Bench points" },
];

function ScoringSplit({ us, them }: { us: LiveTeamView; them: LiveTeamView }) {
  const c = useThemeColors();
  return (
    <div className="space-y-3">
      <div className="flex justify-between text-xs font-semibold">
        <span style={{ color: c.us }}>{us.tricode}</span>
        <span style={{ color: c.them }}>{them.tricode}</span>
      </div>
      {SPLITS.map((s) => {
        const a = us.scoring[s.key];
        const b = them.scoring[s.key];
        const total = a + b;
        return (
          <div key={s.key}>
            <div className="flex justify-between text-xs mb-1">
              <span className="font-mono text-text-primary">{a}</span>
              <span className="text-text-muted">{s.label}</span>
              <span className="font-mono text-text-primary">{b}</span>
            </div>
            <div className="flex h-2 rounded-full overflow-hidden bg-bar-bg" aria-hidden>
              <div style={{ width: `${total ? (100 * a) / total : 50}%`, backgroundColor: c.us }} />
              <div style={{ width: `${total ? (100 * b) / total : 50}%`, backgroundColor: c.them }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function BoxScores({ us, them }: { us: LiveTeamView; them: LiveTeamView }) {
  const [side, setSide] = useState<"us" | "them">("us");
  const team = side === "us" ? us : them;
  const played = team.players.filter((p) => p.played || p.onCourt);
  const dnp = team.players.filter((p) => !p.played && !p.onCourt);
  return (
    <Section
      title="Box score"
      subtitle="● = on the floor now"
      action={
        <div role="group" aria-label="Team" className="flex gap-1">
          {(["us", "them"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSide(s)}
              aria-pressed={side === s}
              className={`px-2.5 py-1 rounded-md text-xs border transition-colors ${side === s ? "bg-lakers-purple text-white border-lakers-purple" : "border-border-theme text-text-muted hover:text-text-primary"}`}
            >
              {s === "us" ? us.tricode : them.tricode}
            </button>
          ))}
        </div>
      }
    >
      <div className="relative overflow-x-auto">
        <table className="w-full text-sm whitespace-nowrap">
          <thead>
            <tr className="text-xs uppercase tracking-wider text-text-muted border-b border-border-theme">
              <th className="text-left py-2 font-medium">Player</th>
              {["MIN", "PTS", "REB", "AST", "STL", "BLK", "TO", "PF", "FG", "3P", "FT", "TS%", "+/-"].map((h) => (
                <th key={h} className="text-right py-2 px-1.5 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {played.map((p) => (
              <tr key={p.personId} className="border-b border-border-theme/50 last:border-0">
                <td className="py-1.5 pr-2">
                  <span className="flex items-center gap-2">
                    <span className={`text-[10px] ${p.onCourt ? "text-green-500" : "text-transparent"}`} aria-label={p.onCourt ? "on the floor" : undefined}>●</span>
                    <PlayerAvatar name={p.name} headshotUrl={p.headshotUrl} size={24} />
                    <Link href={`/players/${p.personId}`} className="text-text-primary hover:text-heading">{p.name}</Link>
                    {p.starter && <span className="text-[10px] text-text-faint">S</span>}
                    <FoulBadge p={p} />
                  </span>
                </td>
                <Num v={minutesLabel(p.minutes)} />
                <Num v={p.pts} strong />
                <Num v={p.reb} title={`${p.oreb} off / ${p.dreb} def`} />
                <Num v={p.ast} />
                <Num v={p.stl} />
                <Num v={p.blk} />
                <Num v={p.tov} />
                <Num v={p.pf} />
                <Num v={`${p.fgm}-${p.fga}`} />
                <Num v={`${p.fg3m}-${p.fg3a}`} />
                <Num v={`${p.ftm}-${p.fta}`} />
                <Num v={fmtPct(p.tsPct, 0)} />
                <Num v={fmtSigned(p.plusMinus, 0)} tone={p.plusMinus > 0 ? "text-green-500" : p.plusMinus < 0 ? "text-red-400" : undefined} />
              </tr>
            ))}
            <tr className="border-t border-border-strong font-semibold">
              <td className="py-1.5 pr-2 text-text-primary">Team</td>
              <Num v="" />
              <Num v={team.score} strong />
              <Num v={team.totals.reb} title={`${team.totals.oreb} off / ${team.totals.dreb} def (player rebounds)`} />
              <Num v={team.totals.ast} />
              <Num v={team.totals.stl} />
              <Num v={team.totals.blk} />
              <Num v={team.totals.tov} title="Includes team turnovers" />
              <Num v={team.totals.pf} />
              <Num v={`${team.totals.fgm}-${team.totals.fga}`} />
              <Num v={`${team.totals.fg3m}-${team.totals.fg3a}`} />
              <Num v={`${team.totals.ftm}-${team.totals.fta}`} />
              <Num v={fmtPct(team.factors.tsPct, 0)} />
              <Num v="" />
            </tr>
          </tbody>
        </table>
      </div>
      {dnp.length > 0 && (
        <p className="text-xs text-text-faint mt-3">
          Not played: {dnp.map((p) => (p.inactive && p.inactiveReason ? `${p.name} (${p.inactiveReason})` : p.name)).join(", ")}
        </p>
      )}
    </Section>
  );
}

function Num({ v, strong, title, tone }: { v: string | number; strong?: boolean; title?: string; tone?: string }) {
  return <td title={title} className={`py-1.5 px-1.5 text-right font-mono ${tone ?? (strong ? "text-text-primary font-semibold" : "text-text-secondary")}`}>{v}</td>;
}

// ── Shots & plays ────────────────────────────────────────────────────────────

function ShotMap({ shots, us, them }: { shots: LiveShot[]; us: string; them: string }) {
  const [team, setTeam] = useState(us);
  const mine = shots.filter((s) => s.tricode === team);
  const made = mine.filter((s) => s.made).length;
  return (
    <Section
      title="Shot map"
      subtitle={`${made}/${mine.length} FG · gold = made, purple = missed`}
      action={
        <div role="group" aria-label="Team" className="flex gap-1">
          {[us, them].map((t) => (
            <button
              key={t}
              onClick={() => setTeam(t)}
              aria-pressed={team === t}
              className={`px-2.5 py-1 rounded-md text-xs border transition-colors ${team === t ? "bg-lakers-purple text-white border-lakers-purple" : "border-border-theme text-text-muted hover:text-text-primary"}`}
            >
              {t}
            </button>
          ))}
        </div>
      }
    >
      <svg viewBox={`0 0 ${COURT_W} ${COURT_H}`} className="w-full max-w-lg mx-auto" role="img" aria-label={`${team} shot locations`}>
        <HalfCourtLines />
        {mine.map((s) => {
          const cx = courtX(s.x);
          const cy = courtY(s.y);
          if (cy < -10 || cy > COURT_H + 10) return null;
          return (
            <circle key={s.id} cx={cx} cy={cy} r={5} fill={s.made ? "#FDB927" : "none"} stroke={s.made ? "#D4980F" : "#7A4BAA"} strokeWidth={s.made ? 1 : 2} opacity={0.85}>
              <title>{`${periodLabel(s.period)} ${s.clock} · ${s.description}`}</title>
            </circle>
          );
        })}
      </svg>
    </Section>
  );
}

function PlayFeed({ game }: { game: LiveGameData }) {
  const c = useThemeColors();
  if (!game.recentPlays.length) return <EmptyState>No plays yet.</EmptyState>;
  return (
    <ol className="space-y-1.5 text-sm">
      {game.recentPlays.map((p) => {
        const ours = p.tricode === game.focus.tricode;
        return (
          <li key={p.id} className="flex gap-3 items-baseline">
            <span className="w-16 shrink-0 font-mono text-xs text-text-faint">{periodLabel(p.period, game.regulationPeriods)} {p.clock}</span>
            <span className="w-9 shrink-0 text-xs font-semibold" style={{ color: p.tricode ? (ours ? c.us : c.them) : undefined }}>{p.tricode ?? ""}</span>
            <span className={`min-w-0 flex-1 ${p.scoring ? "text-text-primary font-medium" : "text-text-secondary"}`}>{p.description}</span>
            {p.scoring && <span className="shrink-0 font-mono text-xs text-text-muted">{p.score}</span>}
          </li>
        );
      })}
    </ol>
  );
}

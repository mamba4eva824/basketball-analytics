"use client";
import { useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { useTeamDashboard } from "@/lib/hooks/useDashboard";
import { FOCUS_TEAM_ID } from "@/lib/constants";
import { fmtNum, fmtPct, fmtSigned, ordinal } from "@/lib/format";
import { PageSkeleton } from "@/components/ui/LoadingSkeleton";
import { ErrorDisplay } from "@/components/ui/ErrorDisplay";
import { RatingTrendChart } from "./RatingTrendChart";
import { RosterTracker } from "./RosterTracker";
import { RotationHeatmap } from "./RotationHeatmap";
import { PlusMinusTracker } from "./PlusMinusTracker";
import { DataNotes, EmptyState, FormStrip, METRIC_META, MetricTile, RankChip, Section, WindowToggle, fmtMetric, type Window } from "./primitives";
import type { RankedMetric, TeamDashboardData, TeamProfileView } from "@/lib/dashboard-types";

const FOUR_FACTORS: { label: string; off: RankedMetric; def: RankedMetric }[] = [
  { label: "Shooting", off: "efgPct", def: "oppEfgPct" },
  { label: "Turnovers", off: "tovPct", def: "oppTovPct" },
  { label: "Off. rebounding", off: "orebPct", def: "oppOrebPct" },
  { label: "Free throws", off: "ftRate", def: "oppFtRate" },
  { label: "3PT volume / accuracy", off: "threePaRate", def: "oppThreePct" },
];

export function LakersDashboard({ teamId = FOCUS_TEAM_ID }: { teamId?: string }) {
  const { data, isLoading, error } = useTeamDashboard(teamId);
  const [win, setWin] = useState<Window>("season");

  if (isLoading) return <PageSkeleton />;
  if (error || !data) return <ErrorDisplay title="Dashboard unavailable" message={error?.message ?? "Could not load dashboard data."} />;

  const profile = win === "season" ? data.snapshot.season : data.snapshot.last10;
  const small = (data.snapshot.season?.games ?? 0) < 5;

  return (
    <div className="space-y-6">
      <DataNotes notes={data.dataNotes} />
      <TeamHeader data={data} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl text-heading">Team efficiency</h2>
        <WindowToggle value={win} onChange={setWin} games={data.snapshot.season?.games ?? 0} />
      </div>
      {profile ? (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {(["netRtg", "offRtg", "defRtg", "pace"] as RankedMetric[]).map((m) => (
              <MetricTile key={m} metric={m} value={profile.metrics[m]} smallSample={small} />
            ))}
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
            <Section
              className="xl:col-span-3"
              title="Game-by-game net rating"
              subtitle="Purple = outscored opponent per 100 possessions, orange = outscored by them. Line = 5-game rolling average."
            >
              {data.ratingTrend.length ? <RatingTrendChart data={data.ratingTrend} /> : <EmptyState>No games yet.</EmptyState>}
            </Section>
            <Section className="xl:col-span-2" title="Four factors" subtitle={`Rank among ${data.league?.teams ?? 30} teams · ${win === "season" ? "season" : "last 10 games"}`}>
              <FourFactorsTable profile={profile} />
            </Section>
          </div>
        </>
      ) : (
        <Section title="No games yet">
          <EmptyState>Ratings appear after the first game is loaded. Until then, use the previous-season lines in the roster tracker below.</EmptyState>
        </Section>
      )}

      <Section
        title="New-look roster"
        subtitle={
          <>
            {data.rosterSummary.new} new · {data.rosterSummary.rookie} rookies · {data.rosterSummary.returning} returning
            {data.rosterSummary.newcomerMinutesShare != null && (
              <> · newcomers have played <strong className="text-text-primary">{fmtPct(data.rosterSummary.newcomerMinutesShare, 0)}</strong> of minutes</>
            )}
          </>
        }
      >
        <RosterTracker roster={data.roster} season={data.season.id} previous={data.season.previous} />
      </Section>

      <Section
        title="Plus-minus trend"
        subtitle="Each player's +/- across the season with a moving average over games played — missed games show as gaps, not zeros"
      >
        <PlusMinusTracker series={data.plusMinus} />
      </Section>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Section title="Rotation" subtitle={`Minutes in the last ${data.rotation.games.length} games · ● = started`}>
          {data.rotation.players.length ? <RotationHeatmap rotation={data.rotation} /> : <EmptyState>No player minutes logged yet.</EmptyState>}
        </Section>
        <div className="space-y-6 min-w-0">
          <Section title="Starting lineups used" subtitle="Grouped by the five players who started">
            <StartingUnits data={data} />
          </Section>
          <Section title="Most-used 5-man units" subtitle="From NBA.com lineup data">
            <TopLineups data={data} />
          </Section>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Section title="Recent games" action={<Link href="/games" className="text-sm text-lakers-purple-light hover:text-heading">All games →</Link>}>
          <RecentGames data={data} />
        </Section>
        <Section title="Up next" action={<Link href="/matchup" className="text-sm text-lakers-purple-light hover:text-heading">Matchup breakdown →</Link>}>
          <Upcoming data={data} />
        </Section>
      </div>

      <p className="text-xs text-text-faint">
        Team ratings and four factors are box-score estimates (see basketball-metrics skill); player lines are NBA.com season averages.
        {data.lastUpdated && <> Data last updated {format(new Date(data.lastUpdated), "PPp")}.</>}
      </p>
    </div>
  );
}

function TeamHeader({ data }: { data: TeamDashboardData }) {
  const { snapshot, upcoming } = data;
  const s = snapshot.season;
  const st = snapshot.standing;
  const next = upcoming[0];
  return (
    <div className="glass-card p-5 md:p-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
        <div>
          <p className="text-xs uppercase tracking-wider text-text-faint">{data.season.displayName}</p>
          <h1 className="text-3xl font-bold text-heading">{snapshot.team.name}</h1>
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
            <HeaderStat label="Record" value={s ? `${s.wins}-${s.losses}` : "0-0"} />
            <HeaderStat label={`${snapshot.team.conference === "WEST" ? "West" : "East"} rank`} value={ordinal(st?.conferenceRank)} />
            <HeaderStat label="Streak" value={st?.streak ?? "—"} />
            <HeaderStat label="Home / Away" value={st?.home && st?.away ? `${st.home} / ${st.away}` : "—"} />
            <HeaderStat label="Avg margin" value={s ? fmtSigned((s.metrics.ppg.value ?? 0) - (s.metrics.oppPpg.value ?? 0)) : "—"} />
          </div>
          <div className="mt-4 max-w-md">
            <FormStrip games={data.recentGames} />
          </div>
        </div>
        {next && (
          <Link href={`/matchup?opponent=${next.opponent.id}`} className="block rounded-xl border border-border-strong bg-surface-alt p-4 hover:bg-surface-hover transition-colors min-w-64">
            <p className="text-xs uppercase tracking-wider text-text-faint">Next game</p>
            <p className="text-xl font-semibold text-text-primary mt-1">
              {next.homeAway === "HOME" ? "vs" : "@"} {next.opponent.name}
            </p>
            <p className="text-sm text-text-muted">
              {format(new Date(next.dateUtc), "EEE MMM d · p")}
              {next.nationalTv && ` · ${next.nationalTv}`}
            </p>
            <p className="text-xs text-lakers-purple-light mt-2">Scout the matchup →</p>
          </Link>
        )}
      </div>
    </div>
  );
}

function HeaderStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-2xl font-bold font-mono text-text-primary">{value}</p>
      <p className="text-xs text-text-faint uppercase tracking-wider">{label}</p>
    </div>
  );
}

function FourFactorsTable({ profile }: { profile: TeamProfileView }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-xs uppercase tracking-wider text-text-muted border-b border-border-theme">
          <th className="text-left py-2 font-medium">Factor</th>
          <th className="text-right py-2 font-medium" colSpan={2}>Offense</th>
          <th className="text-right py-2 font-medium" colSpan={2}>Defense</th>
        </tr>
      </thead>
      <tbody>
        {FOUR_FACTORS.map((f) => (
          <tr key={f.label} className="border-b border-border-theme/60">
            <td className="py-2 text-text-secondary">{f.label}</td>
            <td className="py-2 text-right font-mono tabular-nums text-text-primary" title={METRIC_META[f.off].help}>
              <span className="text-[10px] text-text-faint mr-1">{METRIC_META[f.off].short}</span>
              {fmtMetric(f.off, profile.metrics[f.off].value)}
            </td>
            <td className="py-2 pl-2 text-right w-12"><RankChip rank={profile.metrics[f.off].rank} /></td>
            <td className="py-2 text-right font-mono tabular-nums text-text-primary" title={METRIC_META[f.def].help}>
              <span className="text-[10px] text-text-faint mr-1">{METRIC_META[f.def].short}</span>
              {fmtMetric(f.def, profile.metrics[f.def].value)}
            </td>
            <td className="py-2 pl-2 text-right w-12"><RankChip rank={profile.metrics[f.def].rank} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function StartingUnits({ data }: { data: TeamDashboardData }) {
  const { units, gamesMissingStarterData } = data.startingLineups;
  if (!units.length) return <EmptyState>No starter data yet.</EmptyState>;
  return (
    <ul className="space-y-3">
      {units.map((u) => (
        <li key={u.players.map((p) => p.id).join("-")} className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm text-text-primary min-w-0">{u.players.map((p) => p.name.split(" ").slice(-1)[0]).join(" · ")}</span>
          <span className="text-xs font-mono text-text-muted whitespace-nowrap">
            {u.games} GP · {u.wins}-{u.losses} · {fmtSigned(u.avgMargin)}
          </span>
        </li>
      ))}
      {gamesMissingStarterData > 0 && <li className="text-xs text-text-faint">{gamesMissingStarterData} game(s) missing starter data.</li>}
    </ul>
  );
}

function TopLineups({ data }: { data: TeamDashboardData }) {
  if (!data.topLineups.length) return <EmptyState>Lineup data not loaded yet.</EmptyState>;
  return (
    <ul className="space-y-3">
      {data.topLineups.map((l) => (
        <li key={l.players.map((p) => p.id).join("-")} className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm text-text-primary min-w-0">{l.players.map((p) => p.name.split(" ").slice(-1)[0]).join(" · ")}</span>
          <span className="text-xs font-mono text-text-muted whitespace-nowrap">
            {fmtNum(l.minutes, 0)} min · NET <span className={(l.netRating ?? 0) >= 0 ? "text-green-600 dark:text-green-400" : "text-red-500"}>{fmtSigned(l.netRating)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function RecentGames({ data }: { data: TeamDashboardData }) {
  if (!data.recentGames.length) return <EmptyState>No games played yet.</EmptyState>;
  return (
    <ul className="divide-y divide-border-theme/60">
      {data.recentGames.map((g) => (
        <li key={g.gameId} className="flex items-center justify-between py-2 text-sm">
          <span className="text-text-muted w-20">{format(new Date(g.date), "MMM d")}</span>
          <span className="flex-1 text-text-primary">{g.homeAway === "HOME" ? "vs" : "@"} {g.opponent.abbreviation}</span>
          <span className={`font-mono font-semibold ${g.result === "W" ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"}`}>
            {g.result} {g.points}-{g.oppPoints}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Upcoming({ data }: { data: TeamDashboardData }) {
  if (!data.upcoming.length) return <EmptyState>No upcoming games on the schedule.</EmptyState>;
  return (
    <ul className="divide-y divide-border-theme/60">
      {data.upcoming.map((g) => (
        <li key={g.gameId}>
          <Link href={`/matchup?opponent=${g.opponent.id}`} className="flex items-center justify-between py-2 text-sm hover:bg-surface-hover rounded">
            <span className="text-text-muted w-28">{format(new Date(g.dateUtc), "EEE MMM d")}</span>
            <span className="flex-1 text-text-primary">{g.homeAway === "HOME" ? "vs" : "@"} {g.opponent.name}</span>
            <span className="text-xs text-text-faint">{g.nationalTv ?? format(new Date(g.dateUtc), "p")}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

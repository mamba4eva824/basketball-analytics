"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { useSchedule } from "@/lib/hooks/useSchedule";
import { PageSkeleton } from "@/components/ui/LoadingSkeleton";
import { ErrorDisplay } from "@/components/ui/ErrorDisplay";
import { TeamLogo } from "@/components/ui/TeamLogo";
import { StatCard } from "@/components/layout/StatCard";
import { DataNotes, EmptyState, Section } from "./primitives";
import type { ScheduleData, ScheduleGameView } from "@/lib/dashboard-types";

type Mode = "calendar" | "list";
type ListFilter = "upcoming" | "results" | "all";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "2026-10" for an ET date string. */
const monthKey = (dateEt: string) => dateEt.slice(0, 7);

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return format(new Date(y, m - 1, 1), "MMMM yyyy");
}

function gameHref(g: ScheduleGameView): string {
  if (g.state === "today") return "/matchup?view=live";
  return `/matchup?opponent=${g.opponent.id}`;
}

const vsAt = (g: ScheduleGameView) => (g.homeAway === "HOME" ? "vs" : "@");

/** Lakers schedule: month calendar or list, with results, TV, rest and back-to-backs. */
export function ScheduleView() {
  const { data, isLoading, error, refetch } = useSchedule();
  const [mode, setMode] = useState<Mode>("calendar");

  if (isLoading) return <PageSkeleton />;
  if (error || !data) {
    return <ErrorDisplay title="Schedule unavailable" message={error?.message ?? "Could not load the schedule."} onRetry={() => refetch()} />;
  }

  const notes: string[] = [];
  if (data.season.isDemo) notes.push("Demo data — not the real schedule.");
  if (data.unscheduled > 0) {
    notes.push(`${data.unscheduled} of 82 regular-season games aren't on the schedule yet (NBA Cup knockout-round dates are set after the group stage).`);
  }
  if (data.games.some((g) => g.state === "pending")) {
    notes.push("Some past games show no result yet — run the data refresh to load them.");
  }

  return (
    <div className="space-y-6">
      <DataNotes notes={notes} />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wider text-text-faint">{data.season.displayName}</p>
          <h1 className="text-3xl font-bold text-heading">Schedule</h1>
        </div>
        <div role="tablist" aria-label="Schedule view" className="inline-flex rounded-lg border border-border-theme p-1 gap-1">
          {(["calendar", "list"] as Mode[]).map((m) => (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium capitalize transition-colors ${mode === m ? "bg-lakers-purple text-white" : "text-text-muted hover:text-text-primary"}`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <SummaryTiles data={data} />

      {mode === "calendar" ? <MonthCalendar data={data} /> : <GameList data={data} />}
      <p className="text-xs text-text-faint">Tip-off times are in your local time zone. Calendar days follow the NBA&apos;s US Eastern game date.</p>
    </div>
  );
}

// ── Summary ──────────────────────────────────────────────────────────────────

function SummaryTiles({ data }: { data: ScheduleData }) {
  const s = data.summary;
  const next = data.games.find((g) => g.state === "today" || g.state === "scheduled");
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <StatCard label="Record" value={`${s.wins}-${s.losses}`} subtitle={`${s.played} played`} />
      <StatCard label="Remaining" value={s.remaining} subtitle={`${s.remainingHome} home · ${s.remainingAway} away`} />
      <StatCard label="Back-to-backs left" value={s.remainingBackToBacks} subtitle="Second night of consecutive days" />
      <Link href={next ? gameHref(next) : "#"} className="glass-card stat-card p-5 min-w-0 hover:border-lakers-purple/50 transition-colors">
        <p className="text-xs uppercase tracking-wider text-text-muted">{next?.state === "today" ? "Today" : "Next game"}</p>
        {next ? (
          <>
            <p className="text-lg font-bold text-text-primary mt-1">{vsAt(next)} {next.opponent.name}</p>
            <p className="text-xs text-text-faint mt-1">
              {format(new Date(next.tipoffUtc), "EEE MMM d · h:mm a")}
              {next.nationalTv && ` · ${next.nationalTv}`}
            </p>
          </>
        ) : <p className="text-lg font-bold text-text-faint mt-1">—</p>}
      </Link>
    </div>
  );
}

// ── Calendar ─────────────────────────────────────────────────────────────────

function MonthCalendar({ data }: { data: ScheduleData }) {
  const months = useMemo(() => [...new Set(data.games.map((g) => monthKey(g.dateEt)))], [data.games]);
  const byDate = useMemo(() => new Map(data.games.map((g) => [g.dateEt, g])), [data.games]);
  const todayMonth = monthKey(data.today);
  const [idx, setIdx] = useState(() => {
    if (months.includes(todayMonth)) return months.indexOf(todayMonth);
    const later = months.findIndex((m) => m > todayMonth);
    return later >= 0 ? later : months.length - 1; // season over: open on its last month
  });

  if (!months.length) return <Section title="Calendar"><EmptyState>No games on the schedule.</EmptyState></Section>;
  const key = months[Math.min(idx, months.length - 1)];
  const [y, m] = key.split("-").map(Number);
  const firstWeekday = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: (string | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => `${key}-${String(i + 1).padStart(2, "0")}`),
  ];
  while (cells.length % 7) cells.push(null);
  const monthGames = data.games.filter((g) => monthKey(g.dateEt) === key);
  const home = monthGames.filter((g) => g.homeAway === "HOME").length;

  const nav = (
    <div className="flex items-center gap-1">
      <NavButton label="Previous month" disabled={idx <= 0} onClick={() => setIdx(idx - 1)}>‹</NavButton>
      {months.includes(todayMonth) && key !== todayMonth && (
        <button onClick={() => setIdx(months.indexOf(todayMonth))} className="px-2.5 py-1 rounded-md text-xs border border-border-theme text-text-muted hover:text-text-primary">Today</button>
      )}
      <NavButton label="Next month" disabled={idx >= months.length - 1} onClick={() => setIdx(idx + 1)}>›</NavButton>
    </div>
  );

  return (
    <Section title={monthLabel(key)} subtitle={`${monthGames.length} games · ${home} home · ${monthGames.length - home} away`} action={nav}>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] sm:text-xs uppercase tracking-wider text-text-muted mb-1">
        {WEEKDAYS.map((d) => <div key={d}>{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((date, i) => (
          <DayCell key={date ?? `pad-${i}`} date={date} game={date ? byDate.get(date) : undefined} today={date === data.today} />
        ))}
      </div>
      <Legend />
    </Section>
  );
}

function NavButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: string }) {
  return (
    <button
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="h-8 w-8 rounded-md border border-border-theme text-lg leading-none text-text-muted hover:text-text-primary disabled:opacity-30"
    >
      {children}
    </button>
  );
}

function DayCell({ date, game, today }: { date: string | null; game?: ScheduleGameView; today: boolean }) {
  if (!date) return <div className="min-h-16 sm:min-h-24" aria-hidden />;
  const day = Number(date.slice(8));
  const base = `relative min-h-16 sm:min-h-24 rounded-md border p-1 sm:p-1.5 text-left flex flex-col ${today ? "border-lakers-gold ring-1 ring-lakers-gold" : "border-border-theme/60"}`;
  if (!game) {
    return <div className={`${base} opacity-60`}><span className="text-[10px] sm:text-xs text-text-faint">{day}</span></div>;
  }
  const home = game.homeAway === "HOME";
  return (
    <Link
      href={gameHref(game)}
      className={`${base} ${home ? "bg-lakers-purple/15" : "bg-input"} hover:border-lakers-purple transition-colors`}
      title={gameTitle(game)}
    >
      <span className="flex items-center justify-between text-[10px] sm:text-xs text-text-faint">
        {day}
        {game.backToBack && <span className="rounded bg-amber-500/20 px-1 text-[9px] font-semibold text-amber-600 dark:text-amber-400" title="Back-to-back: played the day before">B2B</span>}
      </span>
      <span className="mt-0.5 text-[11px] sm:text-sm font-semibold text-text-primary leading-tight">
        <span className="font-normal text-text-muted">{vsAt(game)}</span> {game.opponent.abbreviation}
      </span>
      <span className="mt-auto text-[10px] sm:text-xs leading-tight"><CellStatus game={game} /></span>
      {game.label && <span className="hidden sm:block text-[9px] text-lakers-gold-dark dark:text-lakers-gold truncate">{game.label}</span>}
    </Link>
  );
}

function CellStatus({ game }: { game: ScheduleGameView }) {
  switch (game.state) {
    case "final":
      return (
        <span className={game.result === "W" ? "text-green-600 dark:text-green-400 font-semibold" : "text-red-500 dark:text-red-400 font-semibold"}>
          {game.result} <span className="hidden sm:inline">{game.points}-{game.oppPoints}</span>
        </span>
      );
    case "today":
      return <span className="font-semibold text-red-500">Today</span>;
    case "pending":
      return <span className="text-text-faint">—</span>;
    default:
      return <span className="text-text-muted">{format(new Date(game.tipoffUtc), "h:mm a").replace(":00", "")}</span>;
  }
}

function gameTitle(g: ScheduleGameView): string {
  const parts = [`${vsAt(g)} ${g.opponent.name}`, format(new Date(g.tipoffUtc), "EEE MMM d, h:mm a")];
  if (g.state === "final") parts.push(`${g.result} ${g.points}-${g.oppPoints}`);
  if (g.nationalTv) parts.push(g.nationalTv);
  if (g.label) parts.push(g.label);
  if (g.backToBack) parts.push("Back-to-back");
  return parts.join(" · ");
}

function Legend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-xs text-text-muted">
      <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-lakers-purple/25 border border-border-theme" aria-hidden />Home</span>
      <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-input border border-border-theme" aria-hidden />Away</span>
      <span className="flex items-center gap-1.5"><span className="rounded bg-amber-500/20 px-1 text-[9px] font-semibold text-amber-600 dark:text-amber-400">B2B</span>Back-to-back</span>
      <span>Click a game for the scouting report</span>
    </div>
  );
}

// ── List ─────────────────────────────────────────────────────────────────────

function GameList({ data }: { data: ScheduleData }) {
  const [filter, setFilter] = useState<ListFilter>("upcoming");
  const games = data.games.filter((g) =>
    filter === "all" ? true : filter === "results" ? g.state === "final" || g.state === "pending" : g.state === "today" || g.state === "scheduled",
  );
  const ordered = filter === "results" ? [...games].reverse() : games;
  const groups = new Map<string, ScheduleGameView[]>();
  for (const g of ordered) {
    const k = monthKey(g.dateEt);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(g);
  }

  const toggle = (
    <div role="group" aria-label="Filter games" className="flex gap-1">
      {(["upcoming", "results", "all"] as ListFilter[]).map((f) => (
        <button
          key={f}
          onClick={() => setFilter(f)}
          aria-pressed={filter === f}
          className={`px-2.5 py-1 rounded-md text-xs border capitalize transition-colors ${filter === f ? "bg-lakers-purple text-white border-lakers-purple" : "border-border-theme text-text-muted hover:text-text-primary"}`}
        >
          {f}
        </button>
      ))}
    </div>
  );

  return (
    <Section title="Games" subtitle={`${games.length} games`} action={toggle}>
      {!games.length && <EmptyState>No games.</EmptyState>}
      <div className="space-y-6">
        {[...groups].map(([k, list]) => (
          <div key={k}>
            <p className="text-xs uppercase tracking-wider text-text-faint mb-2">{monthLabel(k)}</p>
            <ul className="divide-y divide-border-theme/50">
              {list.map((g) => <ListRow key={g.gameId} game={g} />)}
            </ul>
          </div>
        ))}
      </div>
    </Section>
  );
}

function ListRow({ game }: { game: ScheduleGameView }) {
  const [y, m, d] = game.dateEt.split("-").map(Number);
  const day = new Date(y, m - 1, d);
  return (
    <li>
      <Link href={gameHref(game)} className="flex items-center gap-3 py-2.5 hover:bg-input/60 rounded-md px-1 -mx-1 transition-colors">
        <div className="w-11 shrink-0 text-center">
          <p className="text-[10px] uppercase text-text-faint">{format(day, "EEE")}</p>
          <p className="text-lg font-bold font-mono text-text-primary leading-none">{format(day, "d")}</p>
        </div>
        <TeamLogo abbreviation={game.opponent.abbreviation} primaryColor={game.opponent.primaryColor} size="sm" className="shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-text-primary truncate">
            <span className="font-normal text-text-muted">{vsAt(game)}</span> {game.opponent.name}
          </p>
          <p className="text-xs text-text-faint truncate">
            {[game.arena, game.nationalTv, game.label].filter(Boolean).join(" · ") || " "}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-mono"><CellStatus game={game} /></p>
          <p className="text-[10px] text-text-faint">
            {game.backToBack ? <span className="font-semibold text-amber-600 dark:text-amber-400">Back-to-back</span>
              : game.restDays != null ? `${game.restDays} day${game.restDays === 1 ? "" : "s"} rest` : "Opener"}
          </p>
        </div>
      </Link>
    </li>
  );
}

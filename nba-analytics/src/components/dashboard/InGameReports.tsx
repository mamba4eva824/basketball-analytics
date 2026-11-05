"use client";
import { useState } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import { useLiveReports } from "@/lib/hooks/useLiveReports";
import { fmtNum, fmtPct, fmtSigned } from "@/lib/format";
import { reportMarks, type CheckpointReport, type KeyCheck, type StretchPlayer, type StretchSide } from "@/lib/analytics/ingameReport";
import { EmptyState, Section } from "./primitives";
import type { LiveGameData, LiveReportsResponse } from "@/lib/dashboard-types";

/**
 * In-game checkpoint reports, twice a period: at the midpoint (6:00, or 2:30 in overtime) and at
 * the end. Follows the newest report while the game is on unless an older one is picked; while
 * you're looking back, a dot marks a report that has arrived since.
 */
export function InGameReports({ game }: { game: LiveGameData }) {
  const live = game.status === 2;
  const q = useLiveReports(game.gameId, live);
  const data = q.data && q.data.gameId === game.gameId ? q.data : undefined;
  const reports = data?.reports ?? [];
  const latest = reports[reports.length - 1];

  // null = follow the newest report. Picking an older one stops following; reports that arrive
  // after that (past the newest you'd seen) get a dot until you open them.
  const [picked, setPicked] = useState<string | null>(null);
  const [seenUpTo, setSeenUpTo] = useState(-1);
  const selected = reports.find((r) => r.id === picked) ?? latest;
  const pick = (id: string) => {
    const idx = reports.findIndex((r) => r.id === id);
    setSeenUpTo((s) => Math.max(s, picked === null ? reports.length - 1 : idx));
    setPicked(id === latest?.id ? null : id);
  };
  const unseen = (id: string) => picked !== null && reports.findIndex((r) => r.id === id) > seenUpTo;

  const subtitle = data?.next
    ? `Twice a quarter: at 6:00 and at the end of each period · next report at ${data.next.label}`
    : "Twice a quarter: at 6:00 and at the end of each period";

  return (
    <Section title="In-game reports" subtitle={subtitle} className="lg:col-start-1">
      {q.isError && !data ? (
        <EmptyState>Reports unavailable: {(q.error as Error).message}</EmptyState>
      ) : !data ? (
        <EmptyState>Loading reports…</EmptyState>
      ) : (
        <div className="space-y-4">
          <CheckpointPicker
            data={data}
            regulation={game.regulationPeriods}
            selectedId={selected?.id ?? null}
            unseen={unseen}
            onPick={pick}
          />
          {selected ? (
            <ReportBody report={selected} data={data} />
          ) : (
            <EmptyState>The first report comes at {data.next?.label ?? "Q1 6:00"}.</EmptyState>
          )}
          {data.pregame && <PregameKeys pregame={data.pregame} />}
        </div>
      )}
    </Section>
  );
}

function CheckpointPicker({ data, regulation, selectedId, unseen, onPick }: {
  data: LiveReportsResponse;
  regulation: number;
  selectedId: string | null;
  unseen: (id: string) => boolean;
  onPick: (id: string) => void;
}) {
  const periods = Math.max(regulation, ...data.reports.map((r) => r.period));
  const ready = new Set(data.reports.map((r) => r.id));
  return (
    <div role="tablist" aria-label="Checkpoint" className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
      {reportMarks(periods, regulation).map((m) => {
        const has = ready.has(m.id);
        const active = m.id === selectedId;
        return (
          <button
            key={m.id}
            role="tab"
            aria-selected={active}
            disabled={!has}
            onClick={() => onPick(m.id)}
            title={has ? `Report at ${m.label}` : `Not reached yet`}
            className={`chip relative shrink-0 px-2.5 py-1 font-medium ${has ? "" : "border-dashed border-border-theme"}`}
          >
            {m.label.replace(/^End of /, "End ")}
            {has && !active && unseen(m.id) && (
              <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-lakers-gold" aria-label="new" />
            )}
          </button>
        );
      })}
    </div>
  );
}

function ReportBody({ report: r, data }: { report: CheckpointReport; data: LiveReportsResponse }) {
  const us = data.focusTricode;
  const them = data.oppTricode;
  const segUs = r.segment.focus.pts;
  const segThem = r.segment.opp.pts;
  const tone = r.margin > 0 ? "text-emerald-600 dark:text-emerald-400" : r.margin < 0 ? "text-red-600 dark:text-red-400" : "text-text-secondary";
  return (
    <article aria-label={`Report at ${r.label}`} className="space-y-4">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h4 className="text-base font-semibold text-heading">{r.label}</h4>
        <p className="font-mono text-lg">
          {us} {r.score.focus} – {r.score.opp} {them} <span className={`text-sm ${tone}`}>({fmtSigned(r.margin, 0)})</span>
        </p>
        <p className="text-xs text-text-muted">
          Since {r.segment.from}: {us} {segUs}, {them} {segThem} ({fmtSigned(segUs - segThem, 0)})
        </p>
      </div>

      <ul className="space-y-1.5 text-sm text-text-secondary list-disc pl-5">
        {r.headlines.map((h) => <li key={h}>{h}</li>)}
      </ul>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <StretchTable title={`This stretch (since ${r.segment.from})`} us={r.segment.focus} them={r.segment.opp} />
        <StretchTable title="Game so far" us={r.game.focus} them={r.game.opp} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <PlayerList title={`${us} — this stretch`} players={r.segment.focusPlayers} />
        <PlayerList title={`${them} — this stretch`} players={r.segment.oppPlayers} />
      </div>

      <KeysTable keys={r.keys} us={us} them={them} baseline={data.baseline} />
    </article>
  );
}

const STRETCH_ROWS: { key: keyof StretchSide; label: string; fmt: (v: number | null) => string; lowerBetter?: boolean }[] = [
  { key: "offRtg", label: "Off. rating", fmt: (v) => fmtNum(v) },
  { key: "efgPct", label: "eFG%", fmt: (v) => fmtPct(v) },
  { key: "tovPct", label: "TOV%", fmt: (v) => fmtPct(v), lowerBetter: true },
  { key: "orebPct", label: "OREB%", fmt: (v) => fmtPct(v) },
  { key: "ftRate", label: "FTA rate", fmt: (v) => fmtNum(v, 3) },
  { key: "threePct", label: "3P%", fmt: (v) => fmtPct(v) },
];

function StretchTable({ title, us, them }: { title: string; us: StretchSide; them: StretchSide }) {
  return (
    <div className="rounded-lg border border-border-theme/60 p-3">
      <p className="text-xs uppercase tracking-wider text-text-muted mb-2">{title}</p>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-text-muted">
            <th className="text-left font-medium py-1" />
            <th className="text-right font-medium py-1">{us.tricode}</th>
            <th className="text-right font-medium py-1">{them.tricode}</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-t border-border-theme/40">
            <td className="py-1 text-text-muted text-xs">Points</td>
            <td className="py-1 text-right font-mono">{us.pts}</td>
            <td className="py-1 text-right font-mono">{them.pts}</td>
          </tr>
          {STRETCH_ROWS.map((row) => {
            const a = us[row.key] as number | null;
            const b = them[row.key] as number | null;
            const better = a != null && b != null && a !== b ? ((row.lowerBetter ? a < b : a > b) ? "us" : "them") : null;
            return (
              <tr key={row.key} className="border-t border-border-theme/40">
                <td className="py-1 text-text-muted text-xs">{row.label}</td>
                <td className={`py-1 text-right font-mono ${better === "us" ? "font-bold text-heading" : "text-text-secondary"}`}>{row.fmt(a)}</td>
                <td className={`py-1 text-right font-mono ${better === "them" ? "font-bold text-heading" : "text-text-secondary"}`}>{row.fmt(b)}</td>
              </tr>
            );
          })}
          <tr className="border-t border-border-theme/40">
            <td className="py-1 text-text-muted text-xs">TOV / OREB / FTA</td>
            <td className="py-1 text-right font-mono text-text-secondary">{us.tov} / {us.oreb} / {us.fta}</td>
            <td className="py-1 text-right font-mono text-text-secondary">{them.tov} / {them.oreb} / {them.fta}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function PlayerList({ title, players }: { title: string; players: StretchPlayer[] }) {
  return (
    <div className="rounded-lg border border-border-theme/60 p-3">
      <p className="text-xs uppercase tracking-wider text-text-muted mb-2">{title}</p>
      {players.length === 0 ? (
        <p className="text-sm text-text-muted">No box-score activity.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {players.map((p) => (
            <li key={p.personId} className="flex flex-col sm:flex-row sm:justify-between sm:gap-3">
              <span className="truncate text-text-primary">{p.name}</span>
              <span className="sm:shrink-0 font-mono text-text-secondary text-xs">
                {p.pts} pts · {p.reb} reb · {p.ast} ast · {p.fgm}/{p.fga} FG{p.tov ? ` · ${p.tov} TO` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const VERDICT: Record<NonNullable<KeyCheck["verdict"]>, { text: string; cls: string }> = {
  better: { text: "▲ better", cls: "text-emerald-600 dark:text-emerald-400" },
  worse: { text: "▼ worse", cls: "text-red-600 dark:text-red-400" },
  even: { text: "= even", cls: "text-text-muted" },
};

function KeysTable({ keys, us, them, baseline }: { keys: KeyCheck[]; us: string; them: string; baseline: LiveReportsResponse["baseline"] }) {
  const fmt = (k: KeyCheck, v: number | null) => (k.metric === "ftRate" ? fmtNum(v, 3) : fmtPct(v));
  const note = baseline.focusGames == null
    ? `No ${baseline.season} games in the database for ${us}, so there's no season line to compare with.`
    : `Season lines from ${us}'s ${baseline.focusGames} game${baseline.focusGames === 1 ? "" : "s"}${baseline.oppGames != null ? ` and ${them}'s ${baseline.oppGames}` : ""} before tonight${(baseline.focusGames ?? 0) < 5 ? " (small sample)" : ""}. One game swings fast — read direction, not size.`;
  return (
    <div className="rounded-lg border border-border-theme/60 p-3 overflow-x-auto">
      <p className="text-xs uppercase tracking-wider text-text-muted mb-2">Four factors vs season</p>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-text-muted">
            <th className="text-left font-medium py-1">Factor</th>
            <th className="text-right font-medium py-1">Tonight</th>
            <th className="text-right font-medium py-1" title={`${us}'s season value (its own factor, or what its defense allows)`}>{us} season</th>
            <th className="hidden sm:table-cell text-right font-medium py-1" title={`${them}'s season: what their defense allows on our offense rows, what their offense does on our defense rows`}>{them} usual</th>
            <th className="text-right font-medium py-1"><span className="hidden sm:inline">vs {us} season</span></th>
          </tr>
        </thead>
        <tbody>
          {keys.map((k) => (
            <tr key={`${k.side}-${k.metric}`} className="border-t border-border-theme/40">
              <td className="py-1 text-text-secondary text-xs">{k.label}</td>
              <td className="py-1 text-right font-mono text-text-primary">{fmt(k, k.tonight)}</td>
              <td className="py-1 text-right font-mono text-text-secondary">{fmt(k, k.season)}</td>
              <td className="hidden sm:table-cell py-1 text-right font-mono text-text-secondary">{fmt(k, k.opponentSeason)}</td>
              <td className={`py-1 text-right text-xs ${k.verdict ? VERDICT[k.verdict].cls : "text-text-muted"}`}>{k.verdict ? VERDICT[k.verdict].text : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-text-muted mt-2">{note}</p>
    </div>
  );
}

function PregameKeys({ pregame }: { pregame: NonNullable<LiveReportsResponse["pregame"]> }) {
  return (
    <details className="rounded-lg border border-border-theme/60 p-3">
      <summary className="cursor-pointer text-xs uppercase tracking-wider text-text-muted">Pre-game keys to the game</summary>
      {pregame.keys.length ? (
        <ol className="mt-2 space-y-1.5 text-sm text-text-secondary list-decimal pl-5">
          {pregame.keys.map((k) => (
            <li key={k}><ReactMarkdown components={{ p: ({ children }) => <>{children}</> }}>{k}</ReactMarkdown></li>
          ))}
        </ol>
      ) : (
        <p className="mt-2 text-sm text-text-muted">The pre-game report has no &quot;Keys to the game&quot; section.</p>
      )}
      <Link href={`/matchup?view=postgame&report=${pregame.slug}`} className="mt-2 inline-block text-xs text-lakers-purple dark:text-lakers-purple-light hover:underline">
        Open the full pre-game report →
      </Link>
    </details>
  );
}

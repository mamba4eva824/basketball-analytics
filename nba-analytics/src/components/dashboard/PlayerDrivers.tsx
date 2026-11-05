"use client";
import { useState } from "react";
import { usePlayerDrivers } from "@/lib/hooks/usePlayerDrivers";
import { fmtNum, fmtPct, fmtSigned } from "@/lib/format";
import { DRIVER_FOR, ONOFF_SMALL_MINUTES, PER36_MIN_CHANGE, PER36_SMALL_SAMPLE_MINUTES, type BoxDriver, type BoxStat, type OnOffDriver, type RatingStat } from "@/lib/analytics/playerDrivers";
import type { RankedMetric } from "@/lib/analytics/ranks";
import { PlayerAvatar } from "./PlayerAvatar";
import { DataNotes, EmptyState, METRIC_META, Section, SmallSampleTag } from "./primitives";
import type { DriverPlayer, PlayerDriversData } from "@/lib/dashboard-types";

const BOX_TEXT: Record<BoxStat, { stat: string; why: string }> = {
  tov: { stat: "Turnovers", why: "Who the team's turnovers come from (lower per 36 is better)" },
  oreb: { stat: "Offensive rebounds", why: "Who grabs the team's offensive rebounds" },
  dreb: { stat: "Defensive rebounds", why: "Our defensive rebounds are what keep the opponent's offensive-rebound rate down" },
};

const ONOFF_TEXT: Record<RatingStat, string> = {
  defRtg: "Team defensive rating with each player on vs off the floor (lower is better)",
  offRtg: "Team offensive rating with each player on vs off the floor",
  netRtg: "Team net rating with each player on vs off the floor",
};

const TREND: Record<NonNullable<BoxDriver["trend"]>, { text: string; cls: string }> = {
  improving: { text: "▲ improving", cls: "text-emerald-600 dark:text-emerald-400" },
  slipping: { text: "▼ slipping", cls: "text-red-600 dark:text-red-400" },
  steady: { text: "■ steady", cls: "text-text-muted" },
};

/** Top contributors shown per metric; the rest are one tap away. */
const SHOW = 8;

/**
 * "Who's driving it" on the Season progress page: for each pinned focus metric that has a player
 * breakdown, the players behind it (box-score shares or on/off ratings).
 */
export function PlayerDrivers({ pinned }: { pinned: RankedMetric[] }) {
  const metrics = pinned.filter((m) => DRIVER_FOR[m]);
  const q = usePlayerDrivers(metrics.length > 0);
  const [picked, setPicked] = useState<RankedMetric | null>(null);
  const metric = picked && metrics.includes(picked) ? picked : metrics[0];
  if (!metrics.length) return null;

  return (
    <Section
      title="Who's driving it"
      subtitle="The players behind each focus area"
      action={
        <div role="tablist" aria-label="Focus metric" className="flex flex-wrap gap-1">
          {metrics.map((m) => (
            <button key={m} role="tab" aria-selected={m === metric} onClick={() => setPicked(m)}
              className={`rounded-md px-2.5 py-1 text-xs ${m === metric ? "bg-lakers-purple text-white" : "border border-border-theme text-text-muted hover:text-text-primary"}`}>
              {METRIC_META[m].short}
            </button>
          ))}
        </div>
      }
    >
      {q.isError ? (
        <EmptyState>Player breakdown unavailable: {(q.error as Error).message}</EmptyState>
      ) : !q.data ? (
        <EmptyState>Loading players…</EmptyState>
      ) : (
        <DriverBody data={q.data} metric={metric} />
      )}
    </Section>
  );
}

function DriverBody({ data, metric }: { data: PlayerDriversData; metric: RankedMetric }) {
  const d = DRIVER_FOR[metric]!;
  return (
    <div className="space-y-3">
      <p className="text-sm text-text-secondary">
        <span className="font-semibold text-heading">{METRIC_META[metric].label}:</span> {d.kind === "box" ? BOX_TEXT[d.stat].why : ONOFF_TEXT[d.stat]}.
      </p>
      {d.kind === "box" ? (
        <BoxTable key={metric} data={data} stat={d.stat} />
      ) : data.onOff ? (
        <OnOffTable key={metric} rows={data.onOff[d.stat]} players={data.players} stat={d.stat} />
      ) : (
        <EmptyState>On/off ratings appear once the ETL loads the Lineup Lab totals.</EmptyState>
      )}
      <DataNotes notes={data.dataNotes} />
    </div>
  );
}

function Who({ p }: { p: DriverPlayer | undefined }) {
  const name = p?.name ?? "Unknown";
  return (
    <span className="flex items-center gap-2 min-w-0">
      <PlayerAvatar name={name} headshotUrl={p?.headshotUrl ?? null} size={26} />
      <span className="truncate text-text-primary">{name}{p && !p.onRoster && <span className="ml-1 text-[10px] text-text-muted">(former)</span>}</span>
    </span>
  );
}

function BoxTable({ data, stat }: { data: PlayerDriversData; stat: BoxStat }) {
  const [all, setAll] = useState(false);
  const { drivers, unattributed } = data.box[stat];
  if (!drivers.length) return <EmptyState>No player games yet.</EmptyState>;
  const rows = all ? drivers : drivers.slice(0, SHOW);
  const label = BOX_TEXT[stat].stat;
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[620px]">
          <thead>
            <tr className="text-xs uppercase tracking-wider text-text-muted border-b border-border-theme">
              <th className="text-left font-medium py-2 pr-2">Player</th>
              <th className="text-right font-medium py-2 px-2" title={`Share of the team's ${label.toLowerCase()} this season`}>Share</th>
              <th className="text-right font-medium py-2 px-2" title="Games / minutes this season">GP · MIN</th>
              <th className="text-right font-medium py-2 px-2" title={`${label} per 36 minutes, season`}>Per 36</th>
              <th className="text-right font-medium py-2 px-2" title={`${label} per 36 in the team's last ${data.recentGames} games`}>Last {data.recentGames}</th>
              <th className="text-right font-medium py-2 pl-2" title={`Last ${data.recentGames} vs season per 36, past ±${PER36_MIN_CHANGE[stat]}`}>Trend</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.playerId} className="border-b border-border-theme/50 last:border-0">
                <td className="py-1.5 pr-2"><Who p={data.players[r.playerId]} /></td>
                <td className="py-1.5 px-2 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <div className="h-1.5 w-16 rounded-full bg-bar-bg overflow-hidden" aria-hidden>
                      <div className="h-full bg-lakers-purple" style={{ width: `${Math.min(100, 100 * (r.season.share ?? 0))}%` }} />
                    </div>
                    <span className="font-mono text-text-primary w-12">{fmtPct(r.season.share)}</span>
                  </div>
                </td>
                <td className="py-1.5 px-2 text-right font-mono text-text-secondary">{r.season.games} · {fmtNum(r.season.minutes, 0)}</td>
                <td className="py-1.5 px-2 text-right font-mono text-text-primary">
                  {fmtNum(r.season.per36)}{r.season.smallSample && <SmallSampleTag className="ml-1" />}
                </td>
                <td className="py-1.5 px-2 text-right font-mono text-text-secondary">
                  {r.recent.games ? fmtNum(r.recent.per36) : "—"}
                  <span className="text-[10px] text-text-faint ml-1">({r.recent.games} g)</span>
                </td>
                <td className={`py-1.5 pl-2 text-right text-xs ${r.trend ? TREND[r.trend].cls : "text-text-faint"}`}>
                  {r.trend ? TREND[r.trend].text : r.recent.smallSample ? "small sample" : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-text-muted">
        <span>
          {unattributed != null && unattributed > 0.0005 && `${fmtPct(unattributed)} of the team's ${label.toLowerCase()} aren't charged to a player (team ${label.toLowerCase()}). `}
          {unattributed != null && unattributed < -0.0005 && (
            <span className="text-red-600 dark:text-red-400">{`Player games add up to ${fmtPct(-unattributed)} more ${label.toLowerCase()} than the team box scores — the data is out of sync; re-run the ETL refresh. `}</span>
          )}
          Per 36 and trends are flagged under 5 games or {PER36_SMALL_SAMPLE_MINUTES} minutes.
        </span>
        {drivers.length > SHOW && (
          <button type="button" onClick={() => setAll(!all)} className="underline hover:text-text-primary">
            {all ? "Show fewer" : `Show all ${drivers.length}`}
          </button>
        )}
      </div>
    </div>
  );
}

function OnOffTable({ rows, players, stat }: { rows: OnOffDriver[]; players: Record<string, DriverPlayer>; stat: RatingStat }) {
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, SHOW);
  const fmt = (v: number | null) => (stat === "netRtg" ? fmtSigned(v) : fmtNum(v));
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[620px]">
          <thead>
            <tr className="text-xs uppercase tracking-wider text-text-muted border-b border-border-theme">
              <th className="text-left font-medium py-2 pr-2">Player</th>
              <th className="text-right font-medium py-2 px-2" title="Team rating with the player on the floor">On</th>
              <th className="text-right font-medium py-2 px-2" title="Team rating with the player off the floor">Off</th>
              <th className="text-right font-medium py-2 px-2" title="On vs off, signed so + is better for the team">Impact</th>
              <th className="text-right font-medium py-2 pl-2" title="Minutes on / off the floor this season">MIN on · off</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.playerId} className="border-b border-border-theme/50 last:border-0">
                <td className="py-1.5 pr-2"><Who p={players[r.playerId]} /></td>
                {r.error ? (
                  <td colSpan={4} className="py-1.5 px-2 text-xs text-text-muted text-right">{r.error}</td>
                ) : (
                  <>
                    <td className="py-1.5 px-2 text-right font-mono text-text-primary">{fmt(r.on)}</td>
                    <td className="py-1.5 px-2 text-right font-mono text-text-secondary">{fmt(r.off)}</td>
                    <td className={`py-1.5 px-2 text-right font-mono font-semibold ${r.impact == null ? "text-text-muted" : r.impact >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                      {fmtSigned(r.impact)}
                    </td>
                    <td className="py-1.5 pl-2 text-right font-mono text-text-secondary">
                      {fmtNum(r.minutesOn, 0)} · {fmtNum(r.minutesOff, 0)}{r.smallSample && <SmallSampleTag className="ml-1" />}
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-text-muted">
        <span>
          Season to date from NBA.com on/off totals (same math as the Lineup Lab). On/off mixes in who else shares the floor, so read it next to the Lineup Lab;
          under {ONOFF_SMALL_MINUTES} minutes on or off is a small sample.
        </span>
        {rows.length > SHOW && (
          <button type="button" onClick={() => setAll(!all)} className="underline hover:text-text-primary">
            {all ? "Show fewer" : `Show all ${rows.length}`}
          </button>
        )}
      </div>
    </div>
  );
}

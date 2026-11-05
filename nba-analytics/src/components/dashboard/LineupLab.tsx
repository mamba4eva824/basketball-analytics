"use client";
import { useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useLineupLab } from "@/lib/hooks/useLineupLab";
import { fmtNum, fmtPct, fmtSigned } from "@/lib/format";
import { MAX_COMBO_PLAYERS, SMALL_SAMPLE_MINUTES, type ComboRow } from "@/lib/analytics/lineupCombos";
import { PageSkeleton } from "@/components/ui/LoadingSkeleton";
import { ErrorDisplay } from "@/components/ui/ErrorDisplay";
import { PlayerAvatar } from "./PlayerAvatar";
import { DataNotes, EmptyState, Section } from "./primitives";
import type { LineupPoolPlayer } from "@/lib/dashboard-types";

type Zone = "on" | "off" | "pool";

const parseIds = (v: string | null) => (v ? v.split(",").filter((x) => /^\d+$/.test(x)) : []);

/**
 * /lineups — Lineup Lab. Drag players onto "On the floor" (and optionally "Off the floor") to see
 * how the team does with exactly that combination, next to the same group minus each player.
 * The selection lives in the URL (?on=…&off=…) so a comparison can be shared or bookmarked.
 */
export function LineupLab() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  // State is the source of truth (taps in quick succession must build on each other); the URL
  // mirrors it so a comparison can be shared. router.replace is async, so it can't be read back.
  const [selection, setSel] = useState(() => {
    const on = parseIds(params.get("on"));
    return { on, off: parseIds(params.get("off")).filter((id) => !on.includes(id)) };
  });
  const { on, off } = selection;
  const q = useLineupLab(on, off);

  const setSelection = (nextOn: string[], nextOff: string[]) => {
    setSel({ on: nextOn, off: nextOff });
    const sp = new URLSearchParams(params);
    if (nextOn.length) sp.set("on", nextOn.join(","));
    else sp.delete("on");
    if (nextOff.length) sp.set("off", nextOff.join(","));
    else sp.delete("off");
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  if (q.isLoading && !q.data) return <PageSkeleton />;
  if (q.isError && !q.data) return <ErrorDisplay title="Lineup Lab unavailable" message={(q.error as Error).message} onRetry={() => q.refetch()} />;
  const data = q.data!;

  if (!data.pool.length) {
    return (
      <Section title="Lineup Lab" subtitle={data.season.displayName}>
        <EmptyState>
          No lineup data for {data.season.id} yet. Run <code>etl/refresh.py</code> from a home connection — its &quot;Lineup groups&quot; step pulls
          NBA.com&apos;s 2–5-man group totals and each player&apos;s on-court totals.
        </EmptyState>
      </Section>
    );
  }

  return (
    <LabBody
      data={data}
      on={on}
      off={off}
      refreshing={q.isFetching}
      onChange={setSelection}
    />
  );
}

function LabBody({ data, on, off, refreshing, onChange }: {
  data: NonNullable<ReturnType<typeof useLineupLab>["data"]>;
  on: string[];
  off: string[];
  refreshing: boolean;
  onChange: (on: string[], off: string[]) => void;
}) {
  const [showFormer, setShowFormer] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const byId = new Map(data.pool.map((p) => [p.id, p]));
  const used = on.length + off.length;
  const full = used >= MAX_COMBO_PLAYERS;
  const zoneOf = (id: string): Zone => (on.includes(id) ? "on" : off.includes(id) ? "off" : "pool");

  const move = (id: string, to: Zone) => {
    const from = zoneOf(id);
    if (from === to) return;
    if (from === "pool" && full) return; // no room
    const nextOn = on.filter((x) => x !== id);
    const nextOff = off.filter((x) => x !== id);
    if (to === "on") nextOn.push(id);
    if (to === "off") nextOff.push(id);
    onChange(nextOn, nextOff);
  };

  const onDragStart = (e: DragStartEvent) => setDragging(String(e.active.id));
  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null);
    if (e.over) move(String(e.active.id), e.over.id as Zone);
  };

  const pool = data.pool.filter((p) => zoneOf(p.id) === "pool" && (showFormer || p.onRoster));
  const formerCount = data.pool.filter((p) => !p.onRoster).length;
  const notes = [
    `NBA.com lineup totals for the ${data.season.id} regular season${data.lastUpdated ? `, refreshed ${new Date(data.lastUpdated).toLocaleDateString()}` : ""}. "No …" rows are exact: totals with those players minus the minutes the others shared with them (games played can't be split that way, so it shows "—").`,
    `Ratings and four factors are box-score estimates per 100 possessions over the minutes shown; pace is possessions per 48 minutes. Under ${SMALL_SAMPLE_MINUTES} minutes together is a small sample.`,
  ];
  if (data.season.isDemo) notes.unshift("Demo data — not real stats.");
  const missing = [0, 1, 2, 3, 4, 5].filter((s) => !data.sizes.includes(s));
  if (missing.length) notes.push(`Not loaded for this season: ${missing.map((s) => (s === 0 ? "team totals" : s === 1 ? "player on/off" : `${s}-man groups`)).join(", ")} — some combinations can't be computed until the ETL runs.`);

  return (
    <div className="space-y-6">
      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-6 items-start">
          <Section
            title="Players"
            subtitle="Drag onto a zone, or tap to put a player on the floor. Most minutes first."
            action={formerCount > 0 ? (
              <label className="flex items-center gap-2 text-xs text-text-muted cursor-pointer">
                <input type="checkbox" checked={showFormer} onChange={(e) => setShowFormer(e.target.checked)} />
                Include players no longer on the roster ({formerCount})
              </label>
            ) : undefined}
          >
            <DropZone id="pool" className="min-h-[6rem]">
              {pool.length ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {pool.map((p) => (
                    <PlayerCard key={p.id} player={p} disabled={full} onTap={() => move(p.id, "on")} />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-text-muted py-4 text-center">Everyone&apos;s in a zone.</p>
              )}
            </DropZone>
          </Section>

          {/* phones: zones above the list (tap a player to add); lg+: list left, zones right */}
          <div className="space-y-4 order-first lg:order-none lg:sticky lg:top-[8.5rem]">
            <Section
              title="Build a combination"
              subtitle={`${used} of ${MAX_COMBO_PLAYERS} slots used (on + off) — NBA.com reports groups of up to five`}
              action={used ? (
                <button onClick={() => onChange([], [])} className="text-xs rounded-md border border-border-theme px-2.5 py-1 text-text-primary hover:border-lakers-purple">
                  Clear
                </button>
              ) : undefined}
            >
              <div className="space-y-3">
                <ZoneBox id="on" title="On the floor together" hint="Everyone here must be on the court." ids={on} byId={byId} onMove={move} />
                <ZoneBox id="off" title="Off the floor" hint="Optional: minutes when these players sat." ids={off} byId={byId} onMove={move} />
              </div>
            </Section>
          </div>
        </div>

        <DragOverlay dropAnimation={null}>
          {dragging && byId.get(dragging) ? <PlayerChip player={byId.get(dragging)!} floating /> : null}
        </DragOverlay>
      </DndContext>

      <Section
        title="How they do together"
        subtitle={on.length || off.length ? "The selection, then the same group with each player removed — either way, and off the floor" : "Pick players to compare; the team row is shown for scale"}
        className={refreshing ? "opacity-70 transition-opacity" : "transition-opacity"}
      >
        {data.error ? <EmptyState>{data.error}</EmptyState> : <ComboTable rows={data.rows} byId={byId} />}
      </Section>

      <DataNotes notes={notes} />
    </div>
  );
}

// ── Drag + drop pieces ───────────────────────────────────────────────────────

function DropZone({ id, className = "", children }: { id: Zone; className?: string; children: ReactNode }) {
  const { isOver, setNodeRef } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={`rounded-lg transition-colors ${isOver ? "bg-lakers-purple/10 ring-2 ring-lakers-purple/50" : ""} ${className}`}>
      {children}
    </div>
  );
}

function ZoneBox({ id, title, hint, ids, byId, onMove }: {
  id: "on" | "off";
  title: string;
  hint: string;
  ids: string[];
  byId: Map<string, LineupPoolPlayer>;
  onMove: (id: string, to: Zone) => void;
}) {
  const accent = id === "on" ? "border-lakers-purple/60" : "border-red-500/40";
  return (
    <DropZone id={id}>
      <div className={`rounded-lg border-2 border-dashed ${accent} p-3 min-h-[5.5rem]`} aria-label={title}>
        <div className="flex items-baseline justify-between gap-2 mb-2">
          <p className="text-sm font-semibold text-heading">{title}</p>
          <p className="text-[11px] text-text-muted">{hint}</p>
        </div>
        {ids.length ? (
          <div className="flex flex-wrap gap-2">
            {ids.map((pid) => {
              const p = byId.get(pid);
              return p ? (
                <ZoneChip key={pid} player={p} zone={id} onMove={onMove} />
              ) : (
                <span key={pid} className="text-xs text-text-muted">Player {pid} (no data this season)</span>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-text-muted py-3 text-center">Drop players here</p>
        )}
      </div>
    </DropZone>
  );
}

function PlayerCard({ player: p, disabled, onTap }: { player: LineupPoolPlayer; disabled: boolean; onTap: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: p.id, disabled });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={disabled ? undefined : onTap}
      title={disabled ? `All ${MAX_COMBO_PLAYERS} slots are used — remove someone first` : `Drag, or tap to put ${p.name} on the floor`}
      className={`flex items-center gap-2.5 rounded-lg border border-border-theme bg-surface px-2.5 py-2 select-none touch-none ${
        disabled ? "opacity-50 cursor-not-allowed" : "cursor-grab hover:border-lakers-purple"
      } ${isDragging ? "opacity-30" : ""}`}
    >
      <PlayerAvatar name={p.name} headshotUrl={p.headshotUrl} size={36} />
      <div className="min-w-0 flex-1">
        <p className="text-sm text-text-primary truncate">{p.name}{!p.onRoster && <span className="ml-1 text-[10px] text-text-muted">(former)</span>}</p>
        <p className="text-[11px] text-text-muted">{[p.position, p.jersey ? `#${p.jersey}` : null].filter(Boolean).join(" · ")}{p.position || p.jersey ? " · " : ""}{Math.round(p.minutes)} min</p>
      </div>
    </div>
  );
}

function PlayerChip({ player: p, floating = false }: { player: LineupPoolPlayer; floating?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border border-border-theme bg-surface pl-1 pr-2.5 py-1 text-sm ${floating ? "shadow-lg ring-2 ring-lakers-purple cursor-grabbing" : ""}`}>
      <PlayerAvatar name={p.name} headshotUrl={p.headshotUrl} size={24} />
      {p.name}
    </span>
  );
}

function ZoneChip({ player: p, zone, onMove }: { player: LineupPoolPlayer; zone: "on" | "off"; onMove: (id: string, to: Zone) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: p.id });
  const other = zone === "on" ? "off" : "on";
  const btn = "h-6 w-6 inline-flex items-center justify-center rounded-full text-xs text-text-muted hover:text-text-primary hover:bg-input";
  return (
    <span className={`inline-flex items-center gap-0.5 ${isDragging ? "opacity-30" : ""}`}>
      <span ref={setNodeRef} {...attributes} {...listeners} className="cursor-grab touch-none select-none" title="Drag to another zone or back to the list">
        <PlayerChip player={p} />
      </span>
      <button type="button" onClick={() => onMove(p.id, other)} className={btn} title={`Move to "${other === "on" ? "On the floor" : "Off the floor"}"`} aria-label={`Move ${p.name} ${other} the floor`}>
        ⇄
      </button>
      <button type="button" onClick={() => onMove(p.id, "pool")} className={btn} title="Remove" aria-label={`Remove ${p.name}`}>
        ✕
      </button>
    </span>
  );
}

// ── Results ──────────────────────────────────────────────────────────────────

const KIND_TAG: Record<ComboRow["kind"], { text: string; cls: string }> = {
  selection: { text: "Selection", cls: "bg-lakers-purple text-white" },
  any: { text: "Either way", cls: "bg-input text-text-secondary" },
  without: { text: "Off the floor", cls: "bg-red-500/15 text-red-700 dark:text-red-300" },
  team: { text: "Team", cls: "bg-lakers-gold/25 text-lakers-gold-dark dark:text-lakers-gold" },
};

const COLS: { key: keyof ComboRow; label: string; title: string; fmt: (v: number | null) => string; lowerBetter?: boolean }[] = [
  { key: "minutes", label: "MIN", title: "Minutes on the floor in this combination", fmt: (v) => fmtNum(v, 0) },
  { key: "plusMinus", label: "+/-", title: "Point differential over those minutes", fmt: (v) => fmtSigned(v, 0) },
  { key: "offRtg", label: "ORtg", title: "Points scored per 100 possessions (estimate)", fmt: (v) => fmtNum(v) },
  { key: "defRtg", label: "DRtg", title: "Points allowed per 100 possessions (lower is better)", fmt: (v) => fmtNum(v), lowerBetter: true },
  { key: "pace", label: "Pace", title: "Possessions per 48 minutes", fmt: (v) => fmtNum(v) },
  { key: "efgPct", label: "eFG%", title: "(FGM + 0.5·3PM) / FGA", fmt: (v) => fmtPct(v) },
  { key: "tovPct", label: "TOV%", title: "Turnovers per play (lower is better)", fmt: (v) => fmtPct(v), lowerBetter: true },
  { key: "orebPct", label: "OREB%", title: "Share of own misses rebounded", fmt: (v) => fmtPct(v) },
  { key: "ftRate", label: "FTr", title: "Free-throw attempts per FGA", fmt: (v) => fmtNum(v, 3) },
  { key: "oppEfgPct", label: "Opp eFG%", title: "Opponents' eFG% (lower is better)", fmt: (v) => fmtPct(v), lowerBetter: true },
];

function NetCell({ v, max }: { v: number | null; max: number }) {
  if (v == null) return <span className="text-text-muted">—</span>;
  const w = Math.min(50, (Math.abs(v) / max) * 50);
  const pos = v >= 0;
  return (
    <div className="flex items-center gap-2 min-w-[9rem]">
      <div className="relative h-2 flex-1 rounded-full bg-bar-bg" aria-hidden>
        <div className="absolute top-0 bottom-0 left-1/2 w-px bg-border-strong" />
        <div
          className={`absolute top-0 bottom-0 rounded-full ${pos ? "bg-emerald-500" : "bg-red-500"}`}
          style={pos ? { left: "50%", width: `${w}%` } : { right: "50%", width: `${w}%` }}
        />
      </div>
      <span className={`font-mono font-semibold w-14 text-right ${pos ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>{fmtSigned(v)}</span>
    </div>
  );
}

const surnameOf = (p: LineupPoolPlayer | undefined) => (p ? p.name.split(" ").slice(1).join(" ") || p.name : "");

function tagText(row: ComboRow, byId: Map<string, LineupPoolPlayer>): string {
  const who = row.removed ? surnameOf(byId.get(row.removed)) : "";
  if (row.kind === "any" && who) return `${who} either way`;
  if (row.kind === "without" && who) return `${who} off the floor`;
  return KIND_TAG[row.kind].text;
}

function ComboLabel({ row, byId }: { row: ComboRow; byId: Map<string, LineupPoolPlayer> }) {
  const tag = KIND_TAG[row.kind];
  const face = (id: string) => {
    const p = byId.get(id);
    return <PlayerAvatar key={id} name={p?.name ?? id} headshotUrl={p?.headshotUrl ?? null} size={22} />;
  };
  return (
    <div className="flex items-center gap-2 md:min-w-[14rem]">
      {row.on.length > 0 && <div className="flex -space-x-1.5 shrink-0">{row.on.map(face)}</div>}
      <div className="min-w-0">
        <p className="text-sm text-text-primary leading-tight">{row.label}</p>
        <span className={`inline-block mt-0.5 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${tag.cls}`}>{tagText(row, byId)}</span>
        {row.smallSample && (
          <span className="ml-1 inline-block rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide bg-input text-text-muted" title={`Under ${SMALL_SAMPLE_MINUTES} minutes together — treat with caution`}>
            small sample
          </span>
        )}
      </div>
    </div>
  );
}

function ComboTable({ rows, byId }: { rows: ComboRow[]; byId: Map<string, LineupPoolPlayer> }) {
  const max = Math.max(10, ...rows.map((r) => Math.abs(r.netRtg ?? 0)));
  return (
    <>
      <ComboCards rows={rows} byId={byId} max={max} />
      <ComboGrid rows={rows} byId={byId} max={max} />
    </>
  );
}

const CARD_COLS = COLS.filter((c) => ["minutes", "plusMinus", "offRtg", "defRtg", "efgPct", "tovPct"].includes(c.key));

/** Phones: one card per row so the net rating and key numbers fit without scrolling sideways. */
function ComboCards({ rows, byId, max }: { rows: ComboRow[]; byId: Map<string, LineupPoolPlayer>; max: number }) {
  return (
    <ul className="md:hidden space-y-3">
      {rows.map((r) => (
        <li key={r.id} className={`rounded-lg border border-border-theme/60 p-3 ${r.kind === "selection" ? "bg-lakers-purple/5 border-lakers-purple/40" : ""}`}>
          <ComboLabel row={r} byId={byId} />
          {r.error ? (
            <p className="mt-2 text-xs text-text-muted">{r.error}</p>
          ) : (
            <>
              <div className="mt-2"><NetCell v={r.netRtg} max={max} /></div>
              <dl className="mt-2 grid grid-cols-3 gap-x-3 gap-y-1.5 text-xs">
                {CARD_COLS.map((c) => (
                  <div key={c.key} className="flex justify-between gap-1">
                    <dt className="text-text-muted" title={c.title}>{c.label}</dt>
                    <dd className="font-mono text-text-secondary">{c.fmt(r[c.key] as number | null)}</dd>
                  </div>
                ))}
              </dl>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}

function ComboGrid({ rows, byId, max }: { rows: ComboRow[]; byId: Map<string, LineupPoolPlayer>; max: number }) {
  return (
    <div className="hidden md:block overflow-x-auto">
      <table className="w-full text-sm min-w-[900px]">
        <thead>
          <tr className="text-xs uppercase tracking-wider text-text-muted border-b border-border-theme">
            <th className="text-left font-medium py-2 px-2">Combination</th>
            <th className="text-left font-medium py-2 px-2" title="Net rating: points per 100 possessions, scored minus allowed">Net rating</th>
            {COLS.map((c) => (
              <th key={c.key} title={c.title} className="text-right font-medium py-2 px-2">{c.label}</th>
            ))}
            <th className="text-right font-medium py-2 px-2" title="Games this exact group played together (not available for 'off the floor' rows)">GP</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className={`border-b border-border-theme/50 last:border-0 align-middle ${r.kind === "selection" ? "bg-lakers-purple/5" : ""}`}>
              <td className="py-2 px-2"><ComboLabel row={r} byId={byId} /></td>
              {r.error ? (
                <td colSpan={COLS.length + 2} className="py-2 px-2 text-xs text-text-muted">{r.error}</td>
              ) : (
                <>
                  <td className="py-2 px-2"><NetCell v={r.netRtg} max={max} /></td>
                  {COLS.map((c) => (
                    <td key={c.key} className="py-2 px-2 text-right font-mono text-text-secondary">{c.fmt(r[c.key] as number | null)}</td>
                  ))}
                  <td className="py-2 px-2 text-right font-mono text-text-secondary">{r.gamesPlayed ?? "—"}</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

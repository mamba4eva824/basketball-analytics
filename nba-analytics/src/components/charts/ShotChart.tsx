"use client";
import { useState, useMemo } from "react";
import type { ShotChartEntry, ShotZone } from "@/lib/types";
import { COURT_H, COURT_W, HalfCourtLines, courtX, courtY } from "./HalfCourt";


const ZONE_LABELS: Record<ShotZone, string> = {
  RESTRICTED_AREA: "Restricted Area", IN_THE_PAINT: "Paint", MID_RANGE: "Mid-Range",
  LEFT_CORNER_THREE: "Left Corner 3", RIGHT_CORNER_THREE: "Right Corner 3",
  ABOVE_THE_BREAK_THREE: "Above Break 3", BACKCOURT: "Backcourt",
};

export function ShotChart({ shots }: { shots: ShotChartEntry[] }) {
  const [filter, setFilter] = useState<"all"|"made"|"missed">("all");
  const [selectedZone, setSelectedZone] = useState<ShotZone|"all">("all");

  const filtered = useMemo(() => shots.filter((s) => {
    if (filter === "made" && !s.made) return false;
    if (filter === "missed" && s.made) return false;
    if (selectedZone !== "all" && s.shotZone !== selectedZone) return false;
    return true;
  }), [shots, filter, selectedZone]);

  const stats = useMemo(() => {
    const t = filtered.length, m = filtered.filter((s) => s.made).length;
    return { total: t, made: m, missed: t - m, pct: t > 0 ? ((m / t) * 100).toFixed(1) : "0.0" };
  }, [filtered]);

  const zones = useMemo(() => [...new Set(shots.map((s) => s.shotZone))].sort(), [shots]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex rounded-lg overflow-hidden border border-border-theme">
          {(["all","made","missed"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={`px-4 py-1.5 text-sm capitalize transition-colors ${filter === f ? "bg-lakers-purple text-white" : "bg-input text-text-muted hover:text-text-primary"}`}>{f}</button>
          ))}
        </div>
        <select value={selectedZone} onChange={(e) => setSelectedZone(e.target.value as ShotZone|"all")} className="bg-input border border-border-theme rounded-lg px-3 py-1.5 text-sm text-text-primary outline-none focus:border-lakers-purple/60">
          <option value="all">All Zones</option>
          {zones.map((z) => <option key={z} value={z}>{ZONE_LABELS[z]||z}</option>)}
        </select>
        <div className="flex gap-4 ml-auto text-sm">
          <span className="text-text-muted"><span className="font-mono text-text-primary">{stats.total}</span> shots</span>
          <span className="text-text-muted"><span className="font-mono text-lakers-gold">{stats.made}</span> made</span>
          <span className="text-text-muted"><span className="font-mono text-lakers-purple-light">{stats.missed}</span> missed</span>
          <span className="text-text-muted"><span className="font-mono text-text-primary">{stats.pct}%</span> FG%</span>
        </div>
      </div>
      <div className="glass-card p-4 overflow-hidden">
        <svg viewBox={`0 0 ${COURT_W} ${COURT_H}`} className="w-full max-w-2xl mx-auto" style={{ maxHeight: "550px" }}>
          <HalfCourtLines />
          {filtered.map((shot, i) => {
            const cx = courtX(shot.locationX), cy = courtY(shot.locationY);
            if (cy < -10 || cy > COURT_H + 10) return null;
            return <circle key={shot.id||i} cx={cx} cy={cy} r={3} fill={shot.made?"#FDB927":"#552583"} opacity={0.7} stroke={shot.made?"#FDB927":"#3B1566"} strokeWidth={0.5}><title>{shot.made?"Made":"Missed"} {shot.shotDescription||shot.actionType||""} ({shot.shotDistance}ft)</title></circle>;
          })}
        </svg>
      </div>
    </div>
  );
}

"use client";
import { useState, useMemo } from "react";
import type { ShotChartEntry, ShotZone } from "@/lib/types";
import { useThemeColors } from "@/lib/ThemeContext";

const COURT_W = 500, COURT_H = 470, BX = 250, BY = 52.5;
function svgX(x: number) { return BX + x / 10 * (COURT_W / 50); }
function svgY(y: number) { return BY + y / 10 * (COURT_H / 47); }

const ZONE_LABELS: Record<ShotZone, string> = {
  RESTRICTED_AREA: "Restricted Area", IN_THE_PAINT: "Paint", MID_RANGE: "Mid-Range",
  LEFT_CORNER_THREE: "Left Corner 3", RIGHT_CORNER_THREE: "Right Corner 3",
  ABOVE_THE_BREAK_THREE: "Above Break 3", BACKCOURT: "Backcourt",
};

export function ShotChart({ shots }: { shots: ShotChartEntry[] }) {
  const colors = useThemeColors();
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
          <rect width={COURT_W} height={COURT_H} fill={colors.courtBg} rx="4" />
          <line x1="0" y1="0" x2={COURT_W} y2="0" stroke={colors.courtLineLight} strokeWidth="2" />
          <rect x={COURT_W/2-80} y="0" width="160" height="190" fill="none" stroke={colors.courtLine} strokeWidth="1.5" />
          <circle cx={COURT_W/2} cy="190" r="60" fill="none" stroke={colors.courtLine} strokeWidth="1.5" />
          <path d={`M ${BX-40} 0 A 40 40 0 0 0 ${BX+40} 0`} fill="none" stroke={colors.courtLineMed} strokeWidth="1.5" transform={`translate(0,${BY})`} />
          <circle cx={BX} cy={BY} r="7.5" fill="none" stroke="#FDB927" strokeWidth="2" />
          <line x1={BX-30} y1={BY-7} x2={BX+30} y2={BY-7} stroke={colors.courtLineDetail} strokeWidth="2" />
          <line x1="30" y1="0" x2="30" y2="140" stroke={colors.courtLine} strokeWidth="1.5" />
          <line x1="470" y1="0" x2="470" y2="140" stroke={colors.courtLine} strokeWidth="1.5" />
          <path d="M 30 140 A 238 238 0 0 0 470 140" fill="none" stroke={colors.courtLine} strokeWidth="1.5" />
          <line x1="0" y1={COURT_H} x2={COURT_W} y2={COURT_H} stroke={colors.courtLineLight} strokeWidth="1" />
          {filtered.map((shot, i) => {
            const cx = svgX(shot.locationX), cy = svgY(shot.locationY);
            if (cy < -10 || cy > COURT_H + 10) return null;
            return <circle key={shot.id||i} cx={cx} cy={cy} r={3} fill={shot.made?"#FDB927":"#552583"} opacity={0.7} stroke={shot.made?"#FDB927":"#3B1566"} strokeWidth={0.5}><title>{shot.made?"Made":"Missed"} {shot.shotDescription||shot.actionType||""} ({shot.shotDistance}ft)</title></circle>;
          })}
        </svg>
      </div>
    </div>
  );
}

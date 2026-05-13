"use client";
import { useState, useMemo } from "react";
import Link from "next/link";
import type { RosterPlayer } from "@/lib/types";

type SortKey = "fullName"|"position"|"gamesPlayed"|"minutesPerGame"|"pointsPerGame"|"totalRebPerGame"|"assistsPerGame";

export function PlayerStatsTable({ players, showTeam = false, title, maxRows }: { players: RosterPlayer[]; showTeam?: boolean; title?: string; maxRows?: number }) {
  const [sortKey, setSortKey] = useState<SortKey>("minutesPerGame");
  const [sortDir, setSortDir] = useState<"asc"|"desc">("desc");

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir(key === "fullName" ? "asc" : "desc"); }
  };

  const sorted = useMemo(() => {
    const rows = [...players].sort((a, b) => {
      let aV: string|number, bV: string|number;
      if (sortKey === "fullName") { aV = a.fullName; bV = b.fullName; }
      else if (sortKey === "position") { aV = a.position ?? ""; bV = b.position ?? ""; }
      else { aV = a.seasonStats?.[sortKey] ?? 0; bV = b.seasonStats?.[sortKey] ?? 0; }
      if (aV < bV) return sortDir === "asc" ? -1 : 1;
      if (aV > bV) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return maxRows ? rows.slice(0, maxRows) : rows;
  }, [players, sortKey, sortDir, maxRows]);

  const SH = ({ label, sk, className = "" }: { label: string; sk: SortKey; className?: string }) => (
    <th className={`px-3 py-3 text-left text-xs uppercase tracking-wider cursor-pointer select-none hover:text-heading transition-colors ${sortKey === sk ? "text-heading" : "text-text-muted"} ${className}`} onClick={() => handleSort(sk)}>
      <span className="flex items-center gap-1">{label}{sortKey === sk && <span className="text-[10px]">{sortDir === "asc" ? "\u25B2" : "\u25BC"}</span>}</span>
    </th>
  );

  return (
    <div className="glass-card overflow-hidden">
      {title && <div className="px-5 py-4 border-b border-border-theme"><h3 className="text-lg text-heading">{title}</h3></div>}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead><tr className="border-b border-border-theme bg-surface-alt">
            <SH label="Player" sk="fullName" className="min-w-[160px]" />
            <SH label="Pos" sk="position" /><SH label="GP" sk="gamesPlayed" /><SH label="MPG" sk="minutesPerGame" />
            <SH label="PPG" sk="pointsPerGame" /><SH label="RPG" sk="totalRebPerGame" /><SH label="APG" sk="assistsPerGame" />
          </tr></thead>
          <tbody className="divide-y divide-border-theme">
            {sorted.map((p) => (
              <tr key={p.id} className="hover:bg-lakers-purple/10 transition-colors">
                <td className="px-3 py-3"><Link href={`/players/${p.id}`} className="text-sm font-medium text-text-primary hover:text-heading transition-colors">{p.fullName}</Link>{showTeam && p.team && <span className="text-xs text-text-faint ml-2">{p.team.abbreviation}</span>}</td>
                <td className="px-3 py-3 text-sm text-text-muted">{p.position ?? "-"}</td>
                <td className="px-3 py-3 font-mono text-sm text-text-primary">{p.seasonStats?.gamesPlayed ?? "-"}</td>
                <td className="px-3 py-3 font-mono text-sm text-text-primary">{p.seasonStats?.minutesPerGame?.toFixed(1) ?? "-"}</td>
                <td className="px-3 py-3 font-mono text-sm text-text-primary font-medium">{p.seasonStats?.pointsPerGame?.toFixed(1) ?? "-"}</td>
                <td className="px-3 py-3 font-mono text-sm text-text-primary">{p.seasonStats?.totalRebPerGame?.toFixed(1) ?? "-"}</td>
                <td className="px-3 py-3 font-mono text-sm text-text-primary">{p.seasonStats?.assistsPerGame?.toFixed(1) ?? "-"}</td>
              </tr>
            ))}
            {sorted.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-text-faint text-sm">No players found</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

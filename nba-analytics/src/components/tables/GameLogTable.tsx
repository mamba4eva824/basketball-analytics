"use client";
import { format } from "date-fns";
import type { GameBoxScore, PlayerGameLog } from "@/lib/types";

export function TeamGameLogTable({ games, title }: { games: GameBoxScore[]; title?: string }) {
  return (
    <div className="glass-card overflow-hidden">
      {title && <div className="px-5 py-4 border-b border-border-theme"><h3 className="text-lg text-heading">{title}</h3></div>}
      <div className="overflow-x-auto"><table className="w-full"><thead><tr className="border-b border-border-theme bg-surface-alt">
        {["Date","Opponent","Result","PTS","OPP","FG%","3P%","REB","AST"].map((h) => <th key={h} className="px-3 py-3 text-left text-xs uppercase tracking-wider text-text-muted">{h}</th>)}
      </tr></thead><tbody className="divide-y divide-border-theme">
        {games.map((g) => (
          <tr key={g.id} className="hover:bg-lakers-purple/10 transition-colors">
            <td className="px-3 py-3 text-sm text-text-secondary">{format(new Date(g.gameDate), "MMM d, yyyy")}</td>
            <td className="px-3 py-3 text-sm text-text-primary"><span className="text-text-faint mr-1">{g.homeAway==="AWAY"?"@":"vs"}</span>{g.opponent?.abbreviation??"OPP"}</td>
            <td className="px-3 py-3"><span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${g.result==="W"?"bg-green-500/20 text-green-400":"bg-red-500/20 text-red-400"}`}>{g.result}</span></td>
            <td className="px-3 py-3 font-mono text-sm text-text-primary font-medium">{g.points}</td>
            <td className="px-3 py-3 font-mono text-sm text-text-secondary">{g.opponentPoints}</td>
            <td className="px-3 py-3 font-mono text-sm text-text-primary">{(g.fieldGoalPct*100).toFixed(1)}%</td>
            <td className="px-3 py-3 font-mono text-sm text-text-primary">{(g.threePointPct*100).toFixed(1)}%</td>
            <td className="px-3 py-3 font-mono text-sm text-text-primary">{g.totalRebounds}</td>
            <td className="px-3 py-3 font-mono text-sm text-text-primary">{g.assists}</td>
          </tr>
        ))}
        {games.length===0 && <tr><td colSpan={9} className="px-3 py-8 text-center text-text-faint text-sm">No games found</td></tr>}
      </tbody></table></div>
    </div>
  );
}

export function PlayerGameLogTable({ games, title }: { games: PlayerGameLog[]; title?: string }) {
  return (
    <div className="glass-card overflow-hidden">
      {title && <div className="px-5 py-4 border-b border-border-theme"><h3 className="text-lg text-heading">{title}</h3></div>}
      <div className="overflow-x-auto"><table className="w-full"><thead><tr className="border-b border-border-theme bg-surface-alt">
        {["Date","Matchup","Result","MIN","PTS","REB","AST","STL","BLK","FG","3P","+/-"].map((h) => <th key={h} className="px-3 py-3 text-left text-xs uppercase tracking-wider text-text-muted">{h}</th>)}
      </tr></thead><tbody className="divide-y divide-border-theme">
        {games.map((g) => (
          <tr key={g.id} className="hover:bg-lakers-purple/10 transition-colors">
            <td className="px-3 py-3 text-sm text-text-secondary whitespace-nowrap">{format(new Date(g.gameDate), "MMM d")}</td>
            <td className="px-3 py-3 text-sm text-text-primary whitespace-nowrap">{g.matchup??"-"}</td>
            <td className="px-3 py-3"><span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${g.result==="W"?"bg-green-500/20 text-green-400":"bg-red-500/20 text-red-400"}`}>{g.result}</span></td>
            <td className="px-3 py-3 font-mono text-sm text-text-secondary">{g.minutesStr??g.minutes.toFixed(0)}</td>
            <td className="px-3 py-3 font-mono text-sm text-text-primary font-medium">{g.points}</td>
            <td className="px-3 py-3 font-mono text-sm text-text-primary">{g.totalRebounds}</td>
            <td className="px-3 py-3 font-mono text-sm text-text-primary">{g.assists}</td>
            <td className="px-3 py-3 font-mono text-sm text-text-primary">{g.steals}</td>
            <td className="px-3 py-3 font-mono text-sm text-text-primary">{g.blocks}</td>
            <td className="px-3 py-3 font-mono text-sm text-text-primary whitespace-nowrap">{g.fieldGoalsMade}/{g.fieldGoalsAttempted}</td>
            <td className="px-3 py-3 font-mono text-sm text-text-primary whitespace-nowrap">{g.threePointersMade}/{g.threePointersAttempted}</td>
            <td className={`px-3 py-3 font-mono text-sm font-medium ${g.plusMinus>0?"text-green-400":g.plusMinus<0?"text-red-400":"text-text-muted"}`}>{g.plusMinus>0?"+":""}{g.plusMinus}</td>
          </tr>
        ))}
        {games.length===0 && <tr><td colSpan={12} className="px-3 py-8 text-center text-text-faint text-sm">No games found</td></tr>}
      </tbody></table></div>
    </div>
  );
}

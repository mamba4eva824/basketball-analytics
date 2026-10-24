"use client";
import Link from "next/link";
import { format } from "date-fns";
import { useThemeColors } from "@/lib/ThemeContext";
import { StatusBadge } from "./primitives";
import type { RotationView } from "@/lib/dashboard-types";

const MAX_MINUTES = 42;

/** Minutes per player per game — sequential single-hue heatmap; ● marks a start. */
export function RotationHeatmap({ rotation }: { rotation: RotationView }) {
  const c = useThemeColors();
  return (
    <div className="relative overflow-x-auto -mx-1">
      <table className="w-full border-separate text-xs" style={{ borderSpacing: 2 }}>
        <caption className="sr-only">Minutes played by game; dot marks a start</caption>
        <thead>
          <tr>
            <th className="text-left font-medium text-text-muted px-1 sticky left-0 bg-surface backdrop-blur">Player</th>
            {rotation.games.map((g) => (
              <th key={g.gameId} className="font-normal text-text-faint px-0.5 min-w-9" title={format(new Date(g.date), "PP")}>
                <div>{g.opponentAbbr}</div>
                <div className={g.result === "W" ? "text-green-600 dark:text-green-400" : "text-red-500 dark:text-red-400"}>{g.result}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rotation.players.map((p) => (
            <tr key={p.playerId}>
              <th scope="row" className="text-left font-normal px-1 whitespace-nowrap sticky left-0 bg-surface backdrop-blur">
                <Link href={`/players/${p.playerId}`} className="text-text-primary hover:text-heading">{p.name}</Link>
                {p.status && p.status !== "returning" && <span className="ml-1.5 align-middle"><StatusBadge status={p.status} /></span>}
              </th>
              {p.minutes.map((m, i) => {
                const share = m == null ? 0 : Math.min(1, m / MAX_MINUTES);
                return (
                  <td
                    key={rotation.games[i].gameId}
                    className="h-7 rounded text-center font-mono"
                    style={{
                      backgroundColor: m == null ? "var(--bar-bg)" : `rgba(${c.heat}, ${0.12 + share * 0.88})`,
                      color: share > 0.55 ? "#fff" : "var(--text-secondary)",
                    }}
                    title={m == null ? "Did not play" : `${m.toFixed(1)} min${p.started[i] ? " · started" : ""}`}
                  >
                    {m == null ? "" : Math.round(m)}
                    {p.started[i] && <span aria-label="started" className="ml-0.5 text-[8px] align-top">●</span>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

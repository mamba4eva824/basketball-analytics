"use client";
import { ResponsiveContainer, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Tooltip } from "recharts";
import type { TeamSeasonStats } from "@/lib/types";
import { useThemeColors } from "@/lib/ThemeContext";

function norm(v: number | null | undefined, min: number, max: number): number {
  if (v == null) return 0;
  return ((Math.max(min, Math.min(max, v)) - min) / (max - min)) * 100;
}

export function EfficiencyRadar({ stats }: { stats: TeamSeasonStats }) {
  const colors = useThemeColors();
  const data = [
    { metric: "Off Rtg", value: norm(stats.offensiveRating, 100, 125), raw: stats.offensiveRating?.toFixed(1) ?? "N/A" },
    { metric: "Def Rtg", value: 100 - norm(stats.defensiveRating, 100, 125), raw: stats.defensiveRating?.toFixed(1) ?? "N/A" },
    { metric: "Pace", value: norm(stats.pace, 92, 108), raw: stats.pace?.toFixed(1) ?? "N/A" },
    { metric: "eFG%", value: norm(stats.effectiveFGPct ? stats.effectiveFGPct * 100 : null, 48, 60), raw: stats.effectiveFGPct ? `${(stats.effectiveFGPct * 100).toFixed(1)}%` : "N/A" },
    { metric: "TOV Rate", value: 100 - norm(stats.turnoverRate ? stats.turnoverRate * 100 : null, 10, 20), raw: stats.turnoverRate ? `${(stats.turnoverRate * 100).toFixed(1)}%` : "N/A" },
    { metric: "OREB%", value: norm(stats.offRebPct ? stats.offRebPct * 100 : null, 20, 35), raw: stats.offRebPct ? `${(stats.offRebPct * 100).toFixed(1)}%` : "N/A" },
    { metric: "FT Rate", value: norm(stats.freeThrowRate ? stats.freeThrowRate * 100 : null, 15, 35), raw: stats.freeThrowRate ? `${(stats.freeThrowRate * 100).toFixed(1)}%` : "N/A" },
    { metric: "TS%", value: norm(stats.trueShootingPct ? stats.trueShootingPct * 100 : null, 52, 62), raw: stats.trueShootingPct ? `${(stats.trueShootingPct * 100).toFixed(1)}%` : "N/A" },
  ];

  return (
    <ResponsiveContainer width="100%" height={350}>
      <RadarChart cx="50%" cy="50%" outerRadius="75%" data={data}>
        <PolarGrid stroke={colors.polarGrid} />
        <PolarAngleAxis dataKey="metric" tick={{ fill: colors.tick, fontSize: 11 }} />
        <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
        <Tooltip
          contentStyle={{ backgroundColor: colors.tooltipBg, border: `1px solid ${colors.tooltipBorder}`, borderRadius: "8px", fontSize: "12px" }}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter={(_val: any, _name: any, props: any) => [props.payload?.raw ?? "N/A", props.payload?.metric ?? ""]}
          labelFormatter={() => ""}
        />
        <Radar name="Efficiency" dataKey="value" stroke="#552583" fill="#552583" fillOpacity={0.3} strokeWidth={2} />
      </RadarChart>
    </ResponsiveContainer>
  );
}

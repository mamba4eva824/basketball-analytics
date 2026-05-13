"use client";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { format } from "date-fns";
import type { PlayerGameLog } from "@/lib/types";
import { useThemeColors } from "@/lib/ThemeContext";

export function ShootingChart({ data }: { data: PlayerGameLog[] }) {
  const colors = useThemeColors();
  const sortedData = [...data].reverse();
  const chartData = sortedData.map((game) => ({
    date: format(new Date(game.gameDate), "MMM d"),
    matchup: game.matchup ?? "",
    fg: game.fieldGoalPct != null ? game.fieldGoalPct * 100 : null,
    three: game.threePointPct != null ? game.threePointPct * 100 : null,
    ft: game.freeThrowPct != null ? game.freeThrowPct * 100 : null,
  }));

  return (
    <ResponsiveContainer width="100%" height={320}>
      <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} />
        <XAxis dataKey="date" tick={{ fill: colors.tick, fontSize: 11 }} tickLine={false} axisLine={{ stroke: colors.axis }} interval="preserveStartEnd" />
        <YAxis tick={{ fill: colors.tick, fontSize: 11 }} tickLine={false} axisLine={{ stroke: colors.axis }} width={45} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
        <Tooltip
          contentStyle={{ backgroundColor: colors.tooltipBg, border: `1px solid ${colors.tooltipBorder}`, borderRadius: "8px", fontSize: "12px" }}
          labelStyle={{ color: colors.tooltipLabel }}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter={(val: any) => {
            if (val != null && typeof val === "number") return [`${val.toFixed(1)}%`];
            return ["N/A"];
          }}
          labelFormatter={(label, payload) => { const entry = payload?.[0]?.payload; return entry?.matchup ? `${label} - ${entry.matchup}` : String(label); }}
        />
        <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "12px" }} />
        <Line type="monotone" dataKey="fg" stroke="#552583" strokeWidth={2} dot={{ r: 2, fill: "#552583" }} name="FG%" connectNulls />
        <Line type="monotone" dataKey="three" stroke="#FDB927" strokeWidth={2} dot={{ r: 2, fill: "#FDB927" }} name="3P%" connectNulls />
        <Line type="monotone" dataKey="ft" stroke="#7A4BAA" strokeWidth={2} dot={{ r: 2, fill: "#7A4BAA" }} name="FT%" connectNulls />
      </LineChart>
    </ResponsiveContainer>
  );
}

"use client";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { format } from "date-fns";
import type { TrendPoint } from "@/lib/types";
import { useThemeColors } from "@/lib/ThemeContext";

interface TrendLineProps {
  data: TrendPoint[];
  metricLabel: string;
  isPercentage?: boolean;
}

export function TrendLine({ data, metricLabel, isPercentage = false }: TrendLineProps) {
  const colors = useThemeColors();
  const chartData = data.map((d) => ({
    date: format(new Date(d.gameDate), "MMM d"),
    matchup: d.matchup ?? "",
    value: isPercentage && d.value !== null ? d.value * 100 : d.value,
    rollingAvg: isPercentage && d.rollingAvg !== null ? d.rollingAvg * 100 : d.rollingAvg,
  }));

  const formatValue = (v: number | null) => {
    if (v === null) return "N/A";
    return isPercentage ? `${v.toFixed(1)}%` : v.toFixed(1);
  };

  return (
    <ResponsiveContainer width="100%" height={320}>
      <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} />
        <XAxis dataKey="date" tick={{ fill: colors.tick, fontSize: 11 }} tickLine={false} axisLine={{ stroke: colors.axis }} interval="preserveStartEnd" />
        <YAxis tick={{ fill: colors.tick, fontSize: 11 }} tickLine={false} axisLine={{ stroke: colors.axis }} width={45} tickFormatter={(v) => isPercentage ? `${v}%` : `${v}`} />
        <Tooltip
          contentStyle={{ backgroundColor: colors.tooltipBg, border: `1px solid ${colors.tooltipBorder}`, borderRadius: "8px", fontSize: "12px" }}
          labelStyle={{ color: colors.tooltipLabel }}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter={(val: any, name: any) => [formatValue(typeof val === "number" ? val : null), name === "value" ? "Raw" : "Rolling Avg"]}
          labelFormatter={(label, payload) => { const entry = payload?.[0]?.payload; return entry?.matchup ? `${label} - ${entry.matchup}` : String(label); }}
        />
        <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "12px" }} formatter={(value) => value === "value" ? `Raw ${metricLabel}` : `Rolling Avg`} />
        <Line type="monotone" dataKey="rollingAvg" stroke="#552583" strokeWidth={2.5} dot={false} activeDot={{ fill: "#552583", stroke: "#FDB927", r: 5, strokeWidth: 2 }} name="rollingAvg" />
        <Line type="monotone" dataKey="value" stroke="transparent" dot={{ fill: "#FDB927", r: 3, strokeWidth: 0 }} activeDot={{ fill: "#FDB927", r: 5 }} name="value" />
      </LineChart>
    </ResponsiveContainer>
  );
}

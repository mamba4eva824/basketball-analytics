"use client";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ReferenceLine } from "recharts";
import { useThemeColors } from "@/lib/ThemeContext";

interface PlusMinusBarProps {
  data: { name: string; plusMinus: number; playerId?: string }[];
}

export function PlusMinusBar({ data }: PlusMinusBarProps) {
  const colors = useThemeColors();
  const sorted = [...data].sort((a, b) => b.plusMinus - a.plusMinus);
  return (
    <ResponsiveContainer width="100%" height={Math.max(300, sorted.length * 35)}>
      <BarChart data={sorted} layout="vertical" margin={{ top: 5, right: 30, bottom: 5, left: 80 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} horizontal={false} />
        <XAxis type="number" tick={{ fill: colors.tick, fontSize: 11 }} tickLine={false} axisLine={{ stroke: colors.axis }} />
        <YAxis type="category" dataKey="name" tick={{ fill: colors.labelText, fontSize: 12 }} tickLine={false} axisLine={false} width={75} />
        <Tooltip
          contentStyle={{ backgroundColor: colors.tooltipBg, border: `1px solid ${colors.tooltipBorder}`, borderRadius: "8px", fontSize: "12px" }}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          formatter={(val: any) => {
            const v = typeof val === "number" ? val : 0;
            return [`${v >= 0 ? "+" : ""}${v.toFixed(1)}`, "+/-"];
          }}
        />
        <ReferenceLine x={0} stroke={colors.refLine} />
        <Bar dataKey="plusMinus" radius={[0, 4, 4, 0]} barSize={18}>
          {sorted.map((entry, index) => (
            <Cell key={index} fill={entry.plusMinus >= 0 ? "#FDB927" : "#552583"} opacity={0.85} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

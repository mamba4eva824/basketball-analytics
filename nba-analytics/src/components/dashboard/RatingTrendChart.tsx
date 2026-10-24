"use client";
import { Bar, CartesianGrid, Cell, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { format } from "date-fns";
import { useThemeColors } from "@/lib/ThemeContext";
import { fmtNum, fmtSigned } from "@/lib/format";
import type { RatingTrendPoint } from "@/lib/dashboard-types";

/** Per-game net rating (diverging bars: purple ≥ 0, orange < 0) with a rolling 5-game line. */
export function RatingTrendChart({ data }: { data: RatingTrendPoint[] }) {
  const c = useThemeColors();
  const rows = data.map((d) => ({ ...d, label: `${format(new Date(d.date), "MMM d")} ${d.opponentAbbr}` }));
  return (
    <ResponsiveContainer width="100%" height={280}>
      <ComposedChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: -8 }} barCategoryGap={2}>
        <CartesianGrid vertical={false} stroke={c.grid} />
        <XAxis dataKey="label" tick={{ fill: c.tick, fontSize: 11 }} tickLine={false} axisLine={{ stroke: c.axis }} interval="preserveStartEnd" minTickGap={24} />
        <YAxis tick={{ fill: c.tick, fontSize: 11 }} tickLine={false} axisLine={false} width={44} tickFormatter={(v: number) => fmtSigned(v, 0)} />
        <ReferenceLine y={0} stroke={c.refLine} />
        <Tooltip
          cursor={{ fill: c.grid }}
          contentStyle={{ backgroundColor: c.tooltipBg, border: `1px solid ${c.tooltipBorder}`, borderRadius: 8, fontSize: 12 }}
          labelStyle={{ color: c.tooltipLabel }}
          content={({ active, payload }) => {
            const p = payload?.[0]?.payload as (RatingTrendPoint & { label: string }) | undefined;
            if (!active || !p) return null;
            return (
              <div style={{ backgroundColor: c.tooltipBg, border: `1px solid ${c.tooltipBorder}`, borderRadius: 8, fontSize: 12, padding: "8px 10px" }}>
                <p style={{ color: c.tooltipLabel, fontWeight: 600 }}>{p.label} · {p.result}</p>
                <p style={{ color: c.labelText }}>Net {fmtSigned(p.netRtg)} (ORtg {fmtNum(p.offRtg)} / DRtg {fmtNum(p.defRtg)})</p>
                <p style={{ color: c.labelText }}>5-game rolling net {fmtSigned(p.rollingNet)}</p>
              </div>
            );
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
        <Bar dataKey="netRtg" name="Game net rating" radius={[4, 4, 4, 4]} maxBarSize={22} fill={c.us}>
          {rows.map((r) => (
            <Cell key={r.gameId} fill={r.netRtg >= 0 ? c.us : c.them} />
          ))}
        </Bar>
        <Line dataKey="rollingNet" name="5-game rolling" type="monotone" stroke={c.labelText} strokeWidth={2} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

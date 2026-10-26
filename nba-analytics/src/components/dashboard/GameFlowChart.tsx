"use client";
import { useId } from "react";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useThemeColors } from "@/lib/ThemeContext";
import { fmtSigned } from "@/lib/format";
import { periodLabel } from "@/lib/analytics/live";
import type { MarginPoint } from "@/lib/dashboard-types";

const REG = 12 * 60;
const OT = 5 * 60;

/** Period start times (game seconds) up to `endSec`, for ticks and quarter lines. */
function periodStarts(endSec: number, regulation: number): number[] {
  const starts: number[] = [];
  let t = 0;
  for (let p = 1; t < endSec || p <= regulation; p++) {
    starts.push(t);
    t += p <= regulation ? REG : OT;
  }
  return starts;
}

/** Score margin (us − them) after every basket: purple above zero = we lead, orange below = they lead. */
export function GameFlowChart({ data, elapsedSec, regulation, us, them }: {
  data: MarginPoint[];
  elapsedSec: number;
  regulation: number;
  us: string;
  them: string;
}) {
  const c = useThemeColors();
  const gradId = useId().replace(/:/g, "");
  const rows = [...data, { t: elapsedSec, margin: data.at(-1)?.margin ?? 0, label: "Now" }];
  const max = Math.max(...rows.map((r) => r.margin), 0);
  const min = Math.min(...rows.map((r) => r.margin), 0);
  const split = max - min > 0 ? max / (max - min) : 0.5;
  const starts = periodStarts(elapsedSec, regulation);
  const end = Math.max(regulation * REG, starts.at(-1)! + (starts.length > regulation ? OT : 0));
  const lim = Math.max(5, Math.ceil(Math.max(max, -min) / 5) * 5);

  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset={split} stopColor={c.us} stopOpacity={0.5} />
            <stop offset={split} stopColor={c.them} stopOpacity={0.5} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={c.grid} />
        <XAxis
          type="number"
          dataKey="t"
          domain={[0, end]}
          ticks={starts.map((s) => s + (s < regulation * REG ? REG : OT) / 2)}
          tickFormatter={(v: number) => periodLabel(starts.filter((s) => s <= v).length, regulation)}
          tick={{ fill: c.tick, fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: c.axis }}
        />
        <YAxis domain={[-lim, lim]} tick={{ fill: c.tick, fontSize: 11 }} tickLine={false} axisLine={false} width={44} tickFormatter={(v: number) => fmtSigned(v, 0)} />
        {starts.slice(1).map((s) => <ReferenceLine key={s} x={s} stroke={c.grid} strokeDasharray="3 3" />)}
        <ReferenceLine y={0} stroke={c.refLine} />
        <Tooltip
          content={({ active, payload }) => {
            const p = payload?.[0]?.payload as MarginPoint | undefined;
            if (!active || !p) return null;
            const lead = p.margin === 0 ? "Tied" : p.margin > 0 ? `${us} by ${p.margin}` : `${them} by ${-p.margin}`;
            return (
              <div style={{ backgroundColor: c.tooltipBg, border: `1px solid ${c.tooltipBorder}`, borderRadius: 8, fontSize: 12, padding: "8px 10px" }}>
                <p style={{ color: c.tooltipLabel, fontWeight: 600 }}>{p.label}</p>
                <p style={{ color: c.labelText }}>{lead}</p>
              </div>
            );
          }}
        />
        <Area type="stepAfter" dataKey="margin" stroke={c.labelText} strokeWidth={1.5} fill={`url(#${gradId})`} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

"use client";
import { CartesianGrid, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { format } from "date-fns";
import { useThemeColors } from "@/lib/ThemeContext";
import { gameDay, ordinal } from "@/lib/format";
import { METRIC_META, fmtMetric } from "./primitives";
import type { MetricTrendPointView, MetricWithRank, RankedMetric } from "@/lib/dashboard-types";

/**
 * One metric game by game: the single-game value as a smooth curve through each game,
 * the rolling average (the real smoothing), and the full-season rate as a dashed line.
 */
export function MetricTrendChart({ metric, games, season, rollingWindow, rankedTeams }: {
  metric: RankedMetric;
  games: MetricTrendPointView[];
  season: MetricWithRank;
  rollingWindow: number;
  rankedTeams: number;
}) {
  const rows = games.map((g) => ({
    key: g.gameId,
    label: `${format(gameDay(g.date), "MMM d")} ${g.opponentAbbr}`,
    result: g.result,
    game: g.game[metric],
    rolling: g.rolling[metric],
  }));
  const seasonLabel = `Season ${fmtMetric(metric, season.value)}${season.rank != null ? ` (${ordinal(season.rank)} of ${rankedTeams})` : ""}`;
  return (
    <TrendChart
      rows={rows}
      label={METRIC_META[metric].short}
      fmt={(v) => fmtMetric(metric, v)}
      season={season.value}
      seasonLabel={seasonLabel}
      rollingWindow={rollingWindow}
    />
  );
}

export interface TrendRow {
  key: string;
  label: string;
  result: "W" | "L";
  game: number | null;
  rolling: number | null;
}

/** The chart itself, for any metric: team (MetricTrendChart) or player (Advanced Player Analytics). */
export function TrendChart({ rows, label, fmt, season, seasonLabel, rollingWindow }: {
  rows: TrendRow[];
  label: string;
  fmt: (v: number | null) => string;
  season: number | null;
  seasonLabel: string;
  rollingWindow: number;
}) {
  const c = useThemeColors();
  return (
    <ResponsiveContainer width="100%" height={320}>
      <ComposedChart data={rows} margin={{ top: 16, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke={c.grid} />
        <XAxis dataKey="label" tick={{ fill: c.tick, fontSize: 11 }} tickLine={false} axisLine={{ stroke: c.axis }} interval="preserveStartEnd" minTickGap={24} />
        <YAxis
          tick={{ fill: c.tick, fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={52}
          domain={["auto", "auto"]}
          tickFormatter={(v: number) => fmt(v)}
        />
        {season != null && (
          <ReferenceLine
            y={season}
            stroke={c.labelText}
            strokeDasharray="6 4"
            ifOverflow="extendDomain"
            label={{ value: seasonLabel, position: "insideTopRight", fill: c.tick, fontSize: 11 }}
          />
        )}
        <Tooltip
          content={({ active, payload }) => {
            const p = payload?.[0]?.payload as TrendRow | undefined;
            if (!active || !p) return null;
            return (
              <div style={{ backgroundColor: c.tooltipBg, border: `1px solid ${c.tooltipBorder}`, borderRadius: 8, fontSize: 12, padding: "8px 10px" }}>
                <p style={{ color: c.tooltipLabel, fontWeight: 600 }}>{p.label} · {p.result}</p>
                <p style={{ color: c.labelText }}>{label} this game: {fmt(p.game)}</p>
                <p style={{ color: c.labelText }}>Last {rollingWindow} games: {fmt(p.rolling)}</p>
                <p style={{ color: c.labelText }}>{seasonLabel}</p>
              </div>
            );
          }}
        />
        <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
        <Line dataKey="game" name={`${label} by game`} type="monotone" stroke={c.us} strokeWidth={2} dot={{ r: 3, fill: c.us }} activeDot={{ r: 5 }} connectNulls={false} isAnimationActive={false} />
        <Line dataKey="rolling" name={`${rollingWindow}-game average`} type="monotone" stroke={c.trend} strokeWidth={3} dot={false} connectNulls={false} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

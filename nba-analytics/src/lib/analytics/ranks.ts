import type { TeamProfile } from "./teamProfiles";

export type Direction = "higher" | "lower";

export const RANKED_METRICS = [
  "netRtg",
  "offRtg",
  "defRtg",
  "pace",
  "efgPct",
  "tovPct",
  "orebPct",
  "ftRate",
  "threePaRate",
  "threePct",
  "oppEfgPct",
  "oppTovPct",
  "oppOrebPct",
  "oppFtRate",
  "oppThreePct",
  "ppg",
  "oppPpg",
] as const;

export type RankedMetric = (typeof RANKED_METRICS)[number];

/** Which direction is "better". Pace and 3PA rate are style, ranked high→low for display. */
export const METRIC_DIRECTION: Record<RankedMetric, Direction> = {
  netRtg: "higher",
  offRtg: "higher",
  defRtg: "lower",
  pace: "higher",
  efgPct: "higher",
  tovPct: "lower",
  orebPct: "higher",
  ftRate: "higher",
  threePaRate: "higher",
  threePct: "higher",
  oppEfgPct: "lower",
  oppTovPct: "higher",
  oppOrebPct: "lower",
  oppFtRate: "lower",
  oppThreePct: "lower",
  ppg: "higher",
  oppPpg: "lower",
};

/**
 * Competition ranking ("1, 2, 2, 4"): 1 = best. Null values get a null rank and are not
 * counted. Values are compared at 1e-9 tolerance so float noise doesn't break ties.
 */
export function rankTeams(
  values: { teamId: string; value: number | null }[],
  direction: Direction,
): Map<string, number | null> {
  const ranked = values
    .filter((v): v is { teamId: string; value: number } => v.value != null && !Number.isNaN(v.value))
    .sort((a, b) => (direction === "higher" ? b.value - a.value : a.value - b.value));
  const out = new Map<string, number | null>();
  for (const v of values) out.set(v.teamId, null);
  let prev: number | null = null;
  let prevRank = 0;
  ranked.forEach((v, i) => {
    const rank = prev != null && Math.abs(v.value - prev) < 1e-9 ? prevRank : i + 1;
    out.set(v.teamId, rank);
    prev = v.value;
    prevRank = rank;
  });
  return out;
}

export type TeamRanks = Record<RankedMetric, number | null>;

export function rankProfiles(profiles: Iterable<TeamProfile>): Map<string, TeamRanks> {
  const list = [...profiles];
  const result = new Map<string, TeamRanks>();
  for (const p of list) result.set(p.teamId, {} as TeamRanks);
  for (const metric of RANKED_METRICS) {
    const ranks = rankTeams(
      list.map((p) => ({ teamId: p.teamId, value: p[metric] })),
      METRIC_DIRECTION[metric],
    );
    for (const [teamId, rank] of ranks) result.get(teamId)![metric] = rank;
  }
  return result;
}

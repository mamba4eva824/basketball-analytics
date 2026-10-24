/**
 * Four-factor edges: our offense vs their defense, and our defense vs their offense.
 * Spec: basketball-metrics skill → "Four-factor edges".
 */
import type { RankedMetric, TeamRanks } from "./ranks";
import type { TeamProfile } from "./teamProfiles";

export const EDGE_RANK_GAP = 6;

export type EdgeVerdict = "advantage" | "even" | "disadvantage";

export interface FactorEdge {
  factor: "efg" | "tov" | "oreb" | "ftr";
  label: string;
  /** offense = our offense vs their defense; defense = our defense vs their offense */
  side: "offense" | "defense";
  ours: { metric: RankedMetric; value: number | null; rank: number | null };
  theirs: { metric: RankedMetric; value: number | null; rank: number | null };
  /** theirRank − ourRank; positive = we rank better */
  rankGap: number | null;
  verdict: EdgeVerdict | null;
}

const FACTORS: { factor: FactorEdge["factor"]; label: string; off: RankedMetric; def: RankedMetric }[] = [
  { factor: "efg", label: "Shooting (eFG%)", off: "efgPct", def: "oppEfgPct" },
  { factor: "tov", label: "Ball security (TOV%)", off: "tovPct", def: "oppTovPct" },
  { factor: "oreb", label: "Offensive rebounding (OREB%)", off: "orebPct", def: "oppOrebPct" },
  { factor: "ftr", label: "Getting to the line (FTA rate)", off: "ftRate", def: "oppFtRate" },
];

export function verdictFor(rankGap: number | null): EdgeVerdict | null {
  if (rankGap == null) return null;
  if (rankGap >= EDGE_RANK_GAP) return "advantage";
  if (rankGap <= -EDGE_RANK_GAP) return "disadvantage";
  return "even";
}

export function fourFactorEdges(
  ours: { profile: TeamProfile; ranks: TeamRanks },
  theirs: { profile: TeamProfile; ranks: TeamRanks },
): FactorEdge[] {
  const edges: FactorEdge[] = [];
  for (const side of ["offense", "defense"] as const) {
    for (const f of FACTORS) {
      const ourMetric = side === "offense" ? f.off : f.def;
      const theirMetric = side === "offense" ? f.def : f.off;
      const ourRank = ours.ranks[ourMetric];
      const theirRank = theirs.ranks[theirMetric];
      const rankGap = ourRank != null && theirRank != null ? theirRank - ourRank : null;
      edges.push({
        factor: f.factor,
        label: f.label,
        side,
        ours: { metric: ourMetric, value: ours.profile[ourMetric], rank: ourRank },
        theirs: { metric: theirMetric, value: theirs.profile[theirMetric], rank: theirRank },
        rankGap,
        verdict: verdictFor(rankGap),
      });
    }
  }
  return edges;
}

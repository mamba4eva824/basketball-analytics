import { prisma } from '@/app/api/_lib/prisma'
import type { GroupTotals } from '@/lib/analytics/lineupCombos'

export type LineupGroupRow = Awaited<ReturnType<typeof prisma.lineupGroupStats.findMany>>[number]
type StatColumns = Omit<LineupGroupRow, 'id' | 'teamId' | 'season' | 'seasonId' | 'groupSize' | 'groupKey' | 'gamesPlayed' | 'createdAt' | 'updatedAt'>

/** Opponent totals only when every field is there — never fill a gap with 0 (that invents a metric). */
function oppTotals(r: StatColumns): GroupTotals['opp'] {
  const { oppPts, oppFgm, oppFga, oppFg3m, oppFg3a, oppFtm, oppFta, oppOreb, oppDreb, oppTov } = r
  if (oppPts == null || oppFgm == null || oppFga == null || oppFg3m == null || oppFg3a == null ||
      oppFtm == null || oppFta == null || oppOreb == null || oppDreb == null || oppTov == null) return null
  return { pts: oppPts, fgm: oppFgm, fga: oppFga, fg3m: oppFg3m, fg3a: oppFg3a, ftm: oppFtm, fta: oppFta, oreb: oppOreb, dreb: oppDreb, tov: oppTov }
}

/** A LineupGroupStats or LineupGroupGameStats row as the totals lineupCombos works on (per-game rows count as 1 game). */
export function toGroupTotals(r: StatColumns & { gamesPlayed?: number }): GroupTotals {
  return {
    gamesPlayed: r.gamesPlayed ?? 1,
    minutes: r.minutes,
    pts: r.pts, fgm: r.fgm, fga: r.fga, fg3m: r.fg3m, fg3a: r.fg3a, ftm: r.ftm, fta: r.fta,
    oreb: r.oreb, dreb: r.dreb, ast: r.ast, tov: r.tov, stl: r.stl, blk: r.blk, plusMinus: r.plusMinus,
    opp: oppTotals(r),
  }
}

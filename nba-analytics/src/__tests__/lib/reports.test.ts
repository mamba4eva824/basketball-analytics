import { describe, it, expect } from 'vitest'
import { parseReportName, reportTitle } from '@/lib/reportNames'

describe('report file names', () => {
  it('parses pre- and post-game reports for road and home games', () => {
    expect(parseReportName('2026-10-25-LAL-at-UTA-postgame.md', 'LAL')).toEqual({
      slug: '2026-10-25-LAL-at-UTA-postgame', kind: 'postgame', date: '2026-10-25',
      gameKey: '2026-10-25-LAL-at-UTA', opponentAbbr: 'UTA', homeAway: 'AWAY',
    })
    expect(parseReportName('2026-10-27-POR-at-LAL', 'LAL')).toMatchObject({ kind: 'pregame', opponentAbbr: 'POR', homeAway: 'HOME' })
  })

  it('rejects anything that is not a focus-team game report (incl. path tricks)', () => {
    for (const bad of ['README.md', '../etc/passwd', '2026-10-25-LAL-at-UTA/../../x', '2026-10-25-BOS-at-NYK.md', '2026-10-25-LAL-at-UTA-recap.md']) {
      expect(parseReportName(bad, 'LAL')).toBeNull()
    }
  })

  it('takes the first level-1 heading as the title', () => {
    expect(reportTitle('Intro\n# Lakers @ Jazz — Post-game\n## Result')).toBe('Lakers @ Jazz — Post-game')
    expect(reportTitle('## no h1')).toBeNull()
  })
})

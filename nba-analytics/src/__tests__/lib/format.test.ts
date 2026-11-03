import { describe, it, expect } from 'vitest'
import { DASH, fmtShotPct } from '@/lib/format'

describe('fmtShotPct', () => {
  it('prints a box-score percentage to one decimal, without a % sign', () => {
    expect(fmtShotPct(5, 9)).toBe('55.6')
    expect(fmtShotPct(4, 4)).toBe('100.0')
    expect(fmtShotPct(0, 3)).toBe('0.0')
  })

  it('shows a dash with no attempts', () => {
    expect(fmtShotPct(0, 0)).toBe(DASH)
  })
})

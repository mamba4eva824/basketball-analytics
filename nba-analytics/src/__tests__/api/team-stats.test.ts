import { describe, test, expect } from 'vitest'
import { apiFetch, LAKERS_ID, SEASON } from '../setup'

describe('GET /api/teams/:teamId/stats', () => {
  test('returns stats for valid team and season', async () => {
    const { status, body } = await apiFetch<any>(
      `/api/teams/${LAKERS_ID}/stats?season=${SEASON}`,
    )

    expect(status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data).toBeDefined()
  })

  test('returns error when season param is missing', async () => {
    const { status, body } = await apiFetch<any>(
      `/api/teams/${LAKERS_ID}/stats`,
    )

    expect(status).toBe(400)
    expect(body.success).toBe(false)
    expect(body.error).toBeDefined()
    expect(body.error.code).toBe('BAD_REQUEST')
  })

  test('returns 404 for invalid team ID', async () => {
    const { status, body } = await apiFetch<any>(
      `/api/teams/9999999999/stats?season=${SEASON}`,
    )

    expect(status).toBe(404)
    expect(body.success).toBe(false)
    expect(body.error.code).toBe('NOT_FOUND')
  })

  test('response includes team info', async () => {
    const { body } = await apiFetch<any>(
      `/api/teams/${LAKERS_ID}/stats?season=${SEASON}`,
    )

    const data = body.data
    expect(data).toHaveProperty('team')
    expect(data.team).toHaveProperty('id')
    expect(data.team).toHaveProperty('abbreviation')
    expect(data.team).toHaveProperty('name')
    expect(data.team.id).toBe(LAKERS_ID)
  })

  test('stats include season field', async () => {
    const { body } = await apiFetch<any>(
      `/api/teams/${LAKERS_ID}/stats?season=${SEASON}`,
    )

    expect(body.data.season).toBe(SEASON)
  })

  test('stats include record (wins, losses)', async () => {
    const { body } = await apiFetch<any>(
      `/api/teams/${LAKERS_ID}/stats?season=${SEASON}`,
    )

    const record = body.data.record
    expect(record).toBeDefined()
    expect(record).toHaveProperty('wins')
    expect(record).toHaveProperty('losses')
    expect(record).toHaveProperty('winPct')
    expect(record).toHaveProperty('gamesPlayed')
    expect(typeof record.wins).toBe('number')
    expect(typeof record.losses).toBe('number')
  })

  test('stats include perGame metrics', async () => {
    const { body } = await apiFetch<any>(
      `/api/teams/${LAKERS_ID}/stats?season=${SEASON}`,
    )

    const pg = body.data.perGame
    expect(pg).toBeDefined()
    expect(pg).toHaveProperty('pointsPerGame')
    expect(pg).toHaveProperty('oppPointsPerGame')
    expect(pg).toHaveProperty('fieldGoalPct')
    expect(pg).toHaveProperty('threePointPct')
    expect(pg).toHaveProperty('freeThrowPct')
    expect(pg).toHaveProperty('reboundsPerGame')
    expect(pg).toHaveProperty('assistsPerGame')
    expect(pg).toHaveProperty('stealsPerGame')
    expect(pg).toHaveProperty('blocksPerGame')
    expect(pg).toHaveProperty('turnoversPerGame')
  })

  test('stats include efficiency metrics (offRtg, defRtg, netRtg)', async () => {
    const { body } = await apiFetch<any>(
      `/api/teams/${LAKERS_ID}/stats?season=${SEASON}`,
    )

    const adv = body.data.advanced
    expect(adv).toBeDefined()
    expect(adv).toHaveProperty('offRtg')
    expect(adv).toHaveProperty('defRtg')
    expect(adv).toHaveProperty('netRtg')
    expect(adv).toHaveProperty('pace')
    expect(adv).toHaveProperty('efgPct')
    expect(adv).toHaveProperty('tsPct')
    expect(adv).toHaveProperty('tovPct')
    expect(adv).toHaveProperty('orbPct')
    expect(adv).toHaveProperty('ftRate')
    expect(adv).toHaveProperty('oppEfgPct')
    expect(adv).toHaveProperty('oppTovPct')
    expect(adv).toHaveProperty('oppFtRate')
  })

  test('stats include scoringBreakdown', async () => {
    const { body } = await apiFetch<any>(
      `/api/teams/${LAKERS_ID}/stats?season=${SEASON}`,
    )

    const sb = body.data.scoringBreakdown
    expect(sb).toBeDefined()
    expect(sb).toHaveProperty('fastBreakPtsPerGame')
    expect(sb).toHaveProperty('ptsInPaintPerGame')
    expect(sb).toHaveProperty('ptsOffTurnoversPerGame')
    expect(sb).toHaveProperty('secondChancePtsPerGame')
  })
})

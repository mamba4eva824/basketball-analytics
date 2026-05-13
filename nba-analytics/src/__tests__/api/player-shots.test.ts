import { describe, test, expect } from 'vitest'
import { apiFetch, LEBRON_ID, SEASON } from '../setup'

describe('GET /api/players/:playerId/shots', () => {
  test('returns shot data', async () => {
    const { status, body } = await apiFetch<any>(
      `/api/players/${LEBRON_ID}/shots?season=${SEASON}`,
    )

    expect(status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data).toBeDefined()
    expect(body.data).toHaveProperty('shots')
    expect(Array.isArray(body.data.shots)).toBe(true)
  })

  test('returns error when season param is missing', async () => {
    const { status, body } = await apiFetch<any>(
      `/api/players/${LEBRON_ID}/shots`,
    )

    expect(status).toBe(400)
    expect(body.success).toBe(false)
    expect(body.error.code).toBe('BAD_REQUEST')
  })

  test('response includes player info', async () => {
    const { body } = await apiFetch<any>(
      `/api/players/${LEBRON_ID}/shots?season=${SEASON}`,
    )

    expect(body.data).toHaveProperty('player')
    expect(body.data.player).toHaveProperty('id')
    expect(body.data.player).toHaveProperty('fullName')
    expect(body.data.player.id).toBe(LEBRON_ID)
  })

  test('response includes season field', async () => {
    const { body } = await apiFetch<any>(
      `/api/players/${LEBRON_ID}/shots?season=${SEASON}`,
    )

    expect(body.data.season).toBe(SEASON)
  })

  test('response includes aggregate totals', async () => {
    const { body } = await apiFetch<any>(
      `/api/players/${LEBRON_ID}/shots?season=${SEASON}`,
    )

    expect(body.data).toHaveProperty('totalShots')
    expect(body.data).toHaveProperty('totalMade')
    expect(body.data).toHaveProperty('overallPct')
    expect(typeof body.data.totalShots).toBe('number')
    expect(typeof body.data.totalMade).toBe('number')
    expect(typeof body.data.overallPct).toBe('number')
    expect(body.data.totalMade).toBeLessThanOrEqual(body.data.totalShots)
  })

  test('response includes zone summary', async () => {
    const { body } = await apiFetch<any>(
      `/api/players/${LEBRON_ID}/shots?season=${SEASON}`,
    )

    expect(body.data).toHaveProperty('zoneSummary')
    expect(Array.isArray(body.data.zoneSummary)).toBe(true)

    if (body.data.zoneSummary.length > 0) {
      const zone = body.data.zoneSummary[0]
      expect(zone).toHaveProperty('zone')
      expect(zone).toHaveProperty('made')
      expect(zone).toHaveProperty('attempted')
      expect(zone).toHaveProperty('pct')
      expect(typeof zone.zone).toBe('string')
      expect(typeof zone.made).toBe('number')
      expect(typeof zone.attempted).toBe('number')
      expect(typeof zone.pct).toBe('number')
      expect(zone.made).toBeLessThanOrEqual(zone.attempted)
    }
  })

  test('each shot has coordinates (locX, locY)', async () => {
    const { body } = await apiFetch<any>(
      `/api/players/${LEBRON_ID}/shots?season=${SEASON}`,
    )

    if (body.data.shots.length > 0) {
      for (const shot of body.data.shots.slice(0, 10)) {
        expect(shot).toHaveProperty('locX')
        expect(shot).toHaveProperty('locY')
        expect(typeof shot.locX).toBe('number')
        expect(typeof shot.locY).toBe('number')
      }
    }
  })

  test('each shot has zone and result', async () => {
    const { body } = await apiFetch<any>(
      `/api/players/${LEBRON_ID}/shots?season=${SEASON}`,
    )

    if (body.data.shots.length > 0) {
      for (const shot of body.data.shots.slice(0, 10)) {
        expect(shot).toHaveProperty('shotZone')
        expect(shot).toHaveProperty('shotResult')
        expect(shot).toHaveProperty('shotType')
        expect(['MADE', 'MISSED']).toContain(shot.shotResult)
        expect(['TWO_POINTER', 'THREE_POINTER']).toContain(shot.shotType)
      }
    }
  })

  test('each shot has additional detail fields', async () => {
    const { body } = await apiFetch<any>(
      `/api/players/${LEBRON_ID}/shots?season=${SEASON}`,
    )

    if (body.data.shots.length > 0) {
      const shot = body.data.shots[0]
      expect(shot).toHaveProperty('id')
      expect(shot).toHaveProperty('gameId')
      expect(shot).toHaveProperty('shotZoneArea')
      expect(shot).toHaveProperty('shotZoneRange')
      expect(shot).toHaveProperty('shotDistance')
      expect(shot).toHaveProperty('actionType')
      expect(shot).toHaveProperty('period')
      expect(shot).toHaveProperty('gameClock')
      expect(shot).toHaveProperty('shotValue')
    }
  })

  test('returns 404 for invalid player ID', async () => {
    const { status, body } = await apiFetch<any>(
      `/api/players/9999999999/shots?season=${SEASON}`,
    )

    expect(status).toBe(404)
    expect(body.success).toBe(false)
    expect(body.error.code).toBe('NOT_FOUND')
  })

  test('supports shotResult filter', async () => {
    const { body } = await apiFetch<any>(
      `/api/players/${LEBRON_ID}/shots?season=${SEASON}&shotResult=MADE`,
    )

    expect(body.success).toBe(true)
    for (const shot of body.data.shots) {
      expect(shot.shotResult).toBe('MADE')
    }
  })

  test('supports shotType filter', async () => {
    const { body } = await apiFetch<any>(
      `/api/players/${LEBRON_ID}/shots?season=${SEASON}&shotType=THREE_POINTER`,
    )

    expect(body.success).toBe(true)
    for (const shot of body.data.shots) {
      expect(shot.shotType).toBe('THREE_POINTER')
    }
  })
})

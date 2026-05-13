import { describe, test, expect } from 'vitest'
import { apiFetch, LEBRON_ID, SEASON } from '../setup'

describe('GET /api/players/:playerId/trends', () => {
  test('returns trend data for a metric', async () => {
    const { status, body } = await apiFetch<any>(
      `/api/players/${LEBRON_ID}/trends?metric=pts`,
    )

    expect(status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data).toBeDefined()
    expect(body.data).toHaveProperty('trend')
    expect(Array.isArray(body.data.trend)).toBe(true)
  })

  test('response includes player info', async () => {
    const { body } = await apiFetch<any>(
      `/api/players/${LEBRON_ID}/trends?metric=pts`,
    )

    expect(body.data).toHaveProperty('player')
    expect(body.data.player).toHaveProperty('id')
    expect(body.data.player).toHaveProperty('fullName')
    expect(body.data.player.id).toBe(LEBRON_ID)
  })

  test('response includes metric, field, window, and dataPoints', async () => {
    const { body } = await apiFetch<any>(
      `/api/players/${LEBRON_ID}/trends?metric=pts`,
    )

    expect(body.data).toHaveProperty('metric')
    expect(body.data).toHaveProperty('field')
    expect(body.data).toHaveProperty('window')
    expect(body.data).toHaveProperty('dataPoints')
    expect(body.data.metric).toBe('pts')
    expect(body.data.field).toBe('points')
    expect(typeof body.data.window).toBe('number')
    expect(typeof body.data.dataPoints).toBe('number')
  })

  test('default window is 10', async () => {
    const { body } = await apiFetch<any>(
      `/api/players/${LEBRON_ID}/trends?metric=pts`,
    )

    expect(body.data.window).toBe(10)
  })

  test('supports window parameter', async () => {
    const { body } = await apiFetch<any>(
      `/api/players/${LEBRON_ID}/trends?metric=pts&window=5`,
    )

    expect(body.success).toBe(true)
    expect(body.data.window).toBe(5)
  })

  test('supports season filter', async () => {
    const { body } = await apiFetch<any>(
      `/api/players/${LEBRON_ID}/trends?metric=pts&season=${SEASON}`,
    )

    expect(body.success).toBe(true)
    expect(body.data.season).toBe(SEASON)
  })

  test('each entry has gameDate, value, rollingAvg', async () => {
    const { body } = await apiFetch<any>(
      `/api/players/${LEBRON_ID}/trends?metric=pts`,
    )

    if (body.data.trend.length > 0) {
      for (const entry of body.data.trend.slice(0, 10)) {
        expect(entry).toHaveProperty('gameDate')
        expect(entry).toHaveProperty('value')
        expect(entry).toHaveProperty('rollingAvg')
        expect(entry).toHaveProperty('gameId')
      }
    }
  })

  test('rollingAvg is a number when value is present', async () => {
    const { body } = await apiFetch<any>(
      `/api/players/${LEBRON_ID}/trends?metric=pts`,
    )

    const entriesWithValues = body.data.trend.filter(
      (e: any) => e.value !== null,
    )
    if (entriesWithValues.length > 0) {
      for (const entry of entriesWithValues.slice(0, 10)) {
        expect(typeof entry.rollingAvg).toBe('number')
      }
    }
  })

  test('returns error for missing metric param', async () => {
    const { status, body } = await apiFetch<any>(
      `/api/players/${LEBRON_ID}/trends`,
    )

    expect(status).toBe(400)
    expect(body.success).toBe(false)
    expect(body.error.code).toBe('BAD_REQUEST')
  })

  test('returns error for invalid metric', async () => {
    const { status, body } = await apiFetch<any>(
      `/api/players/${LEBRON_ID}/trends?metric=invalid_stat`,
    )

    expect(status).toBe(400)
    expect(body.success).toBe(false)
    expect(body.error.code).toBe('BAD_REQUEST')
  })

  test('returns 404 for invalid player ID', async () => {
    const { status, body } = await apiFetch<any>(
      '/api/players/9999999999/trends?metric=pts',
    )

    expect(status).toBe(404)
    expect(body.success).toBe(false)
    expect(body.error.code).toBe('NOT_FOUND')
  })

  test('works with different metric aliases', async () => {
    const { body: bodyPts } = await apiFetch<any>(
      `/api/players/${LEBRON_ID}/trends?metric=points`,
    )
    expect(bodyPts.success).toBe(true)
    expect(bodyPts.data.field).toBe('points')

    const { body: bodyReb } = await apiFetch<any>(
      `/api/players/${LEBRON_ID}/trends?metric=reb`,
    )
    expect(bodyReb.success).toBe(true)
    expect(bodyReb.data.field).toBe('reboundsTotal')

    const { body: bodyAst } = await apiFetch<any>(
      `/api/players/${LEBRON_ID}/trends?metric=ast`,
    )
    expect(bodyAst.success).toBe(true)
    expect(bodyAst.data.field).toBe('assists')
  })
})

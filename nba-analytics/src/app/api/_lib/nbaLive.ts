import type { RawLiveAction, RawLiveBoxScore } from '@/lib/analytics/live'

/**
 * Server-side client for the NBA live feed (cdn.nba.com/static/json/liveData).
 *
 * - The CDN answers 403 to requests without browser-like headers, and its CORS policy only
 *   allows nba.com, so the browser can't call it directly — /api/live proxies it.
 * - Like stats.nba.com it refuses cloud/datacenter IPs: this works when the app runs on a
 *   home connection (local dev), not from a cloud host.
 * - A missing file (box score before tip-off) is also a 403/404; those return null.
 */

const BASE = 'https://cdn.nba.com/static/json/liveData'

const HEADERS = {
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:158.0) Gecko/20100101 Firefox/158.0',
  Referer: 'https://www.nba.com/',
  Origin: 'https://www.nba.com',
}

/** The feed itself updates every ~10 s; this keeps several open tabs from multiplying calls. */
const TTL_MS = 8_000
const cache = new Map<string, { at: number; data: unknown }>()

export class LiveFeedError extends Error {}

async function getJson<T>(path: string): Promise<T | null> {
  const hit = cache.get(path)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data as T | null

  let res: Response
  try {
    res = await fetch(`${BASE}/${path}`, { headers: HEADERS, cache: 'no-store', signal: AbortSignal.timeout(8_000) })
  } catch (e) {
    throw new LiveFeedError(`NBA live feed unreachable: ${(e as Error).message}`)
  }
  if (res.status === 403 || res.status === 404) {
    cache.set(path, { at: Date.now(), data: null })
    return null
  }
  if (!res.ok) throw new LiveFeedError(`NBA live feed returned HTTP ${res.status}`)
  const data = (await res.json()) as T
  cache.set(path, { at: Date.now(), data })
  return data
}

export interface RawScoreboardTeam {
  teamId: number
  teamName: string
  teamCity: string
  teamTricode: string
  wins: number
  losses: number
}

export interface RawScoreboardGame {
  gameId: string
  gameStatus: number
  gameStatusText: string
  gameTimeUTC: string
  homeTeam: RawScoreboardTeam
  awayTeam: RawScoreboardTeam
}

export async function fetchScoreboard(): Promise<RawScoreboardGame[]> {
  const json = await getJson<{ scoreboard: { games: RawScoreboardGame[] } }>('scoreboard/todaysScoreboard_00.json')
  if (!json) throw new LiveFeedError('NBA live scoreboard unavailable (blocked or not published)')
  return json.scoreboard.games
}

export async function fetchBoxScore(gameId: string): Promise<RawLiveBoxScore | null> {
  const json = await getJson<{ game: RawLiveBoxScore }>(`boxscore/boxscore_${gameId}.json`)
  return json?.game ?? null
}

export async function fetchPlayByPlay(gameId: string): Promise<RawLiveAction[]> {
  const json = await getJson<{ game: { actions: RawLiveAction[] } }>(`playbyplay/playbyplay_${gameId}.json`)
  return json?.game.actions ?? []
}

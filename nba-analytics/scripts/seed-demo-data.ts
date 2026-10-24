/**
 * Demo data seed — SYNTHETIC numbers for UI development, screenshots and e2e tests.
 *
 * Creates all 30 teams (real IDs/names — static facts), fictional players, a round-robin
 * schedule with N completed rounds before today and upcoming rounds after, box scores,
 * player logs, season stats (current + previous), standings, Lakers lineups and a few
 * injuries. Season display names carry "(demo data)" so the UI labels everything.
 *
 * Usage:  npx tsx scripts/seed-demo-data.ts [--rounds 14]
 * Wipes the database first.
 */
import 'dotenv/config'
import { PrismaClient, Prisma, Conference, Division, HomeAway, WinLoss } from '../src/generated/prisma/client'
import { CURRENT_SEASON, FOCUS_TEAM_ID, previousSeason, seasonStartYear } from '../src/lib/constants'
import { DEMO_MARKER } from '../src/app/api/_lib/dashboardData'

const prisma = new PrismaClient()
const ROUNDS = Number(process.argv[process.argv.indexOf('--rounds') + 1]) || 14
const UPCOMING_ROUNDS = 10
const SEASON = CURRENT_SEASON
const PREV = previousSeason(SEASON)
const DAY = 24 * 3600 * 1000

// ── Deterministic PRNG ──────────────────────────────────────────────────────
let seed = 20261024
function rand() {
  seed |= 0
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const between = (a: number, b: number) => a + (b - a) * rand()
const int = (a: number, b: number) => Math.round(between(a, b))
const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)]
const r3 = (x: number) => Math.round(x * 1000) / 1000

// ── Teams (real, static) ─────────────────────────────────────────────────────
const TEAMS: [string, string, string, string, Conference, Division, string, string][] = [
  ['1610612737', 'ATL', 'Atlanta', 'Hawks', 'EAST', 'SOUTHEAST', '#E03A3E', '#C1D32F'],
  ['1610612738', 'BOS', 'Boston', 'Celtics', 'EAST', 'ATLANTIC', '#007A33', '#BA9653'],
  ['1610612751', 'BKN', 'Brooklyn', 'Nets', 'EAST', 'ATLANTIC', '#000000', '#FFFFFF'],
  ['1610612766', 'CHA', 'Charlotte', 'Hornets', 'EAST', 'SOUTHEAST', '#1D1160', '#00788C'],
  ['1610612741', 'CHI', 'Chicago', 'Bulls', 'EAST', 'CENTRAL', '#CE1141', '#000000'],
  ['1610612739', 'CLE', 'Cleveland', 'Cavaliers', 'EAST', 'CENTRAL', '#860038', '#041E42'],
  ['1610612742', 'DAL', 'Dallas', 'Mavericks', 'WEST', 'SOUTHWEST', '#00538C', '#002B5E'],
  ['1610612743', 'DEN', 'Denver', 'Nuggets', 'WEST', 'NORTHWEST', '#0E2240', '#FEC524'],
  ['1610612765', 'DET', 'Detroit', 'Pistons', 'EAST', 'CENTRAL', '#C8102E', '#1D42BA'],
  ['1610612744', 'GSW', 'Golden State', 'Warriors', 'WEST', 'PACIFIC', '#1D428A', '#FFC72C'],
  ['1610612745', 'HOU', 'Houston', 'Rockets', 'WEST', 'SOUTHWEST', '#CE1141', '#000000'],
  ['1610612754', 'IND', 'Indiana', 'Pacers', 'EAST', 'CENTRAL', '#002D62', '#FDBB30'],
  ['1610612746', 'LAC', 'LA', 'Clippers', 'WEST', 'PACIFIC', '#C8102E', '#1D428A'],
  ['1610612747', 'LAL', 'Los Angeles', 'Lakers', 'WEST', 'PACIFIC', '#552583', '#FDB927'],
  ['1610612763', 'MEM', 'Memphis', 'Grizzlies', 'WEST', 'SOUTHWEST', '#5D76A9', '#12173F'],
  ['1610612748', 'MIA', 'Miami', 'Heat', 'EAST', 'SOUTHEAST', '#98002E', '#F9A01B'],
  ['1610612749', 'MIL', 'Milwaukee', 'Bucks', 'EAST', 'CENTRAL', '#00471B', '#EEE1C6'],
  ['1610612750', 'MIN', 'Minnesota', 'Timberwolves', 'WEST', 'NORTHWEST', '#0C2340', '#236192'],
  ['1610612740', 'NOP', 'New Orleans', 'Pelicans', 'WEST', 'SOUTHWEST', '#0C2340', '#C8102E'],
  ['1610612752', 'NYK', 'New York', 'Knicks', 'EAST', 'ATLANTIC', '#006BB6', '#F58426'],
  ['1610612760', 'OKC', 'Oklahoma City', 'Thunder', 'WEST', 'NORTHWEST', '#007AC1', '#EF6C00'],
  ['1610612753', 'ORL', 'Orlando', 'Magic', 'EAST', 'SOUTHEAST', '#0077C0', '#C4CED4'],
  ['1610612755', 'PHI', 'Philadelphia', '76ers', 'EAST', 'ATLANTIC', '#006BB6', '#ED174C'],
  ['1610612756', 'PHX', 'Phoenix', 'Suns', 'WEST', 'PACIFIC', '#1D1160', '#E56020'],
  ['1610612757', 'POR', 'Portland', 'Trail Blazers', 'WEST', 'NORTHWEST', '#E03A3E', '#000000'],
  ['1610612758', 'SAC', 'Sacramento', 'Kings', 'WEST', 'PACIFIC', '#5A2D81', '#63727A'],
  ['1610612759', 'SAS', 'San Antonio', 'Spurs', 'WEST', 'SOUTHWEST', '#C4CED4', '#000000'],
  ['1610612761', 'TOR', 'Toronto', 'Raptors', 'EAST', 'ATLANTIC', '#CE1141', '#000000'],
  ['1610612762', 'UTA', 'Utah', 'Jazz', 'WEST', 'NORTHWEST', '#002B5C', '#00471B'],
  ['1610612764', 'WAS', 'Washington', 'Wizards', 'EAST', 'SOUTHEAST', '#002B5C', '#E31837'],
]
const teamIds = TEAMS.map((t) => t[0])

// ── Fictional players ────────────────────────────────────────────────────────
const FIRST = ['Avery', 'Jalen', 'Marcus', 'Tobias', 'Dario', 'Elijah', 'Rafael', 'Quentin', 'Noah', 'Isaiah', 'Caleb', 'Mateo', 'Andre', 'Kofi', 'Luca', 'Omar', 'Felix', 'Theo', 'Zion', 'Malik', 'Desmond', 'Rowan', 'Jonah', 'Tariq']
const LAST = ['Fixture', 'Sample', 'Mockley', 'Demoson', 'Placeholder', 'Testa', 'Synth', 'Stubbs', 'Example', 'Dummond', 'Proto', 'Draftly', 'Seedman', 'Fakeworth', 'Pseudo', 'Simms']
const POSITIONS = ['G', 'G', 'F', 'F', 'C', 'G', 'F', 'G-F', 'F-C', 'G', 'F', 'C', 'G']
// minutes + usage weight by rotation slot (0-4 starters)
const SLOT_MIN = [34, 33, 31, 29, 27, 24, 21, 18, 15, 12, 0, 0, 0]
const SLOT_USG = [1.45, 1.2, 1.0, 0.85, 0.8, 0.85, 0.75, 0.65, 0.55, 0.45, 0, 0, 0]

interface DemoPlayer {
  id: string
  teamId: string
  slot: number
  first: string
  last: string
  fromYear: number
  prevTeamId: string | null
}

const startYear = seasonStartYear(SEASON)
const players: DemoPlayer[] = []
teamIds.forEach((teamId, ti) => {
  for (let slot = 0; slot < 13; slot++) {
    const isLakers = teamId === FOCUS_TEAM_ID
    // Lakers: big turnover — slots 1, 6, 9 return; 11, 12 are rookies; rest arrived this summer
    let prevTeamId: string | null = teamId
    let fromYear = startYear - int(1, 11)
    if (isLakers) {
      if ([11, 12].includes(slot)) {
        prevTeamId = null
        fromYear = startYear
      } else if (![1, 6, 9].includes(slot)) {
        prevTeamId = pick(teamIds.filter((t) => t !== FOCUS_TEAM_ID))
      }
    } else if (slot === 12) {
      prevTeamId = null
      fromYear = startYear
    }
    players.push({
      id: String(1700000 + ti * 100 + slot),
      teamId,
      slot,
      first: FIRST[(ti * 7 + slot * 5) % FIRST.length],
      last: LAST[(ti * 3 + slot * 11) % LAST.length],
      fromYear,
      prevTeamId,
    })
  }
})

// ── Team strength + schedule (circle-method round robin) ─────────────────────
const strength = new Map(teamIds.map((id) => [id, { off: between(-6, 6), def: between(-6, 6), pace: between(-3, 3) }]))
strength.set(FOCUS_TEAM_ID, { off: 4.5, def: -1.0, pace: 1.5 })

function rounds(n: number): [string, string][][] {
  const ids = [...teamIds]
  const out: [string, string][][] = []
  for (let r = 0; r < n; r++) {
    const pairs: [string, string][] = []
    for (let i = 0; i < ids.length / 2; i++) {
      const a = ids[i]
      const b = ids[ids.length - 1 - i]
      pairs.push(r % 2 === 0 ? [a, b] : [b, a]) // [home, away]
    }
    out.push(pairs)
    ids.splice(1, 0, ids.pop()!) // rotate all but the first
  }
  return out
}

interface Side {
  pts: number; fgm: number; fga: number; fg3m: number; fg3a: number; ftm: number; fta: number
  oreb: number; dreb: number; ast: number; stl: number; blk: number; tov: number; pf: number
}

function simSide(offId: string, defId: string, poss: number, home: boolean): Side {
  const o = strength.get(offId)!
  const d = strength.get(defId)!
  const quality = (o.off + d.def + (home ? 1 : -1)) / 100 // ±~0.12
  const tov = Math.max(6, Math.round(poss * between(0.12, 0.15) - quality * 20))
  const fta = int(16, 28)
  const fga = Math.round(poss - tov - 0.44 * fta + int(8, 13))
  const fg3a = Math.round(fga * between(0.36, 0.46))
  const fg3m = Math.round(fg3a * Math.min(0.48, Math.max(0.26, between(0.32, 0.39) + quality)))
  const fg2a = fga - fg3a
  const fg2m = Math.round(fg2a * Math.min(0.66, Math.max(0.44, between(0.51, 0.56) + quality)))
  const ftm = Math.round(fta * between(0.72, 0.84))
  const fgm = fg2m + fg3m
  return {
    pts: 2 * fg2m + 3 * fg3m + ftm,
    fgm, fga, fg3m, fg3a, ftm, fta,
    oreb: int(7, 14), dreb: int(29, 38), ast: Math.round(fgm * between(0.55, 0.7)),
    stl: int(5, 10), blk: int(3, 7), tov, pf: int(16, 23),
  }
}

/**
 * Lakers availability by rotation slot and round, so the +/- tracker has absences to show:
 * slot 2 misses 4 games mid-season and returns on a minutes limit; slot 7 is out for the last
 * 2 games (matches the day-to-day injury seeded below); slot 0 rests once.
 */
function lakersAvailability(slot: number, round: number): 'normal' | 'out' | 'rest' | 'limited' {
  if (slot === 2 && round >= 4 && round <= 7) return 'out'
  if (slot === 2 && round === 8) return 'limited'
  if (slot === 7 && round >= ROUNDS - 2 && round < ROUNDS) return 'out'
  if (slot === 0 && round === 10) return 'rest'
  return 'normal'
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`[demo-seed] Wiping database and seeding ${SEASON} (${ROUNDS} rounds played) + ${PREV} season stats`)
  await prisma.playerInjury.deleteMany()
  await prisma.scheduledGame.deleteMany()
  await prisma.shotChart.deleteMany()
  await prisma.lineupStats.deleteMany()
  await prisma.standing.deleteMany()
  await prisma.teamEfficiencySnapshot.deleteMany()
  await prisma.teamGameEfficiency.deleteMany()
  await prisma.teamSeasonStats.deleteMany()
  await prisma.playerSeasonStats.deleteMany()
  await prisma.playerGameLog.deleteMany()
  await prisma.gameBoxScore.deleteMany()
  await prisma.player.deleteMany()
  await prisma.team.deleteMany()
  await prisma.season.deleteMany()

  await prisma.season.createMany({
    data: [
      { id: SEASON, startYear, endYear: startYear + 1, displayName: `${SEASON} Season ${DEMO_MARKER}`, isCurrent: true },
      { id: PREV, startYear: startYear - 1, endYear: startYear, displayName: `${PREV} Season ${DEMO_MARKER}`, isCurrent: false },
    ],
  })
  await prisma.team.createMany({
    data: TEAMS.map(([id, abbreviation, city, nickname, conference, division, primaryColor, secondaryColor]) => ({
      id, abbreviation, city, nickname, conference, division, primaryColor, secondaryColor,
      name: `${city} ${nickname}`,
    })),
  })
  await prisma.player.createMany({
    data: players.map((p) => ({
      id: p.id,
      firstName: p.first,
      lastName: p.last,
      fullName: `${p.first} ${p.last}`,
      position: POSITIONS[p.slot],
      jersey: String((p.slot * 7 + 3) % 45),
      teamId: p.teamId,
      fromYear: p.fromYear,
      toYear: startYear,
      isActive: true,
    })),
  })

  const allRounds = rounds(ROUNDS + UPCOMING_ROUNDS)
  const now = Date.now()
  const gameRows: Prisma.GameBoxScoreCreateManyInput[] = []
  const logRows: Prisma.PlayerGameLogCreateManyInput[] = []
  const scheduleRows: Prisma.ScheduledGameCreateManyInput[] = []
  const rosterBy = new Map(teamIds.map((id) => [id, players.filter((p) => p.teamId === id)]))
  let gameSeq = 1

  allRounds.forEach((pairs, r) => {
    const played = r < ROUNDS
    // completed rounds every 2 days ending yesterday; upcoming every 2 days from tomorrow
    const day = played ? now - (ROUNDS - r) * 2 * DAY + DAY : now + (r - ROUNDS) * 2 * DAY + DAY
    const tip = new Date(Math.floor(day / DAY) * DAY + 26.5 * 3600 * 1000) // 02:30 UTC next day ≈ 7:30pm PT
    for (const [homeId, awayId] of pairs) {
      const gameId = `00${startYear % 100 === 0 ? '2' : '2'}${String(startYear % 100).padStart(2, '0')}${String(gameSeq++).padStart(5, '0')}`
      const homeAbbr = TEAMS.find((t) => t[0] === homeId)![1]
      scheduleRows.push({
        gameId, season: SEASON, seasonId: SEASON, gameDateUtc: tip,
        gameDateEt: new Date(tip.getTime() - 5 * 3600 * 1000).toISOString().slice(0, 10),
        status: played ? 3 : 1, statusText: played ? 'Final' : '10:30 pm ET',
        homeTeamId: homeId, awayTeamId: awayId,
        arena: `${homeAbbr} Arena (demo)`, arenaCity: TEAMS.find((t) => t[0] === homeId)![2],
        nationalTv: r % 3 === 0 && pairs.indexOf([homeId, awayId]) < 2 ? 'ESPN' : null,
      })
      if (!played) continue

      const poss = 99 + (strength.get(homeId)!.pace + strength.get(awayId)!.pace) / 2 + between(-3, 3)
      const home = simSide(homeId, awayId, poss, true)
      const away = simSide(awayId, homeId, poss, false)
      if (home.pts === away.pts) {
        // no ties: award the home side one extra made free throw
        home.pts += 1
        home.ftm += 1
        home.fta += 1
      }
      const gameDate = new Date(tip.getTime() - 8 * 3600 * 1000)
      scheduleRows[scheduleRows.length - 1].homeScore = home.pts
      scheduleRows[scheduleRows.length - 1].awayScore = away.pts
      gameRows.push({
        gameId, gameDate, season: SEASON, seasonId: SEASON, homeTeamId: homeId, awayTeamId: awayId,
        homePoints: home.pts, homeFieldGoals: home.fgm, homeFieldGoalAtt: home.fga, homeFieldGoalPct: r3(home.fgm / home.fga),
        homeThreePointers: home.fg3m, homeThreePointAtt: home.fg3a, homeThreePointPct: r3(home.fg3m / home.fg3a),
        homeFreeThrows: home.ftm, homeFreeThrowAtt: home.fta, homeFreeThrowPct: r3(home.ftm / home.fta),
        homeReboundsOff: home.oreb, homeReboundsDef: home.dreb, homeReboundsTotal: home.oreb + home.dreb,
        homeAssists: home.ast, homeSteals: home.stl, homeBlocks: home.blk, homeTurnovers: home.tov, homePersonalFouls: home.pf,
        awayPoints: away.pts, awayFieldGoals: away.fgm, awayFieldGoalAtt: away.fga, awayFieldGoalPct: r3(away.fgm / away.fga),
        awayThreePointers: away.fg3m, awayThreePointAtt: away.fg3a, awayThreePointPct: r3(away.fg3m / away.fg3a),
        awayFreeThrows: away.ftm, awayFreeThrowAtt: away.fta, awayFreeThrowPct: r3(away.ftm / away.fta),
        awayReboundsOff: away.oreb, awayReboundsDef: away.dreb, awayReboundsTotal: away.oreb + away.dreb,
        awayAssists: away.ast, awaySteals: away.stl, awayBlocks: away.blk, awayTurnovers: away.tov, awayPersonalFouls: away.pf,
        arena: `${homeAbbr} Arena (demo)`,
      })

      for (const [teamId, us, them, isHome] of [[homeId, home, away, true], [awayId, away, home, false]] as const) {
        const roster = rosterBy.get(teamId)!
        // Lakers rotate the 5th starter between slots 4 and 5 to show lineup tracking
        const swap = teamId === FOCUS_TEAM_ID && r % 3 === 2
        const avail = (p: DemoPlayer) => (teamId === FOCUS_TEAM_ID ? lakersAvailability(p.slot, r) : 'normal')
        const rotation = roster.filter((p) => SLOT_MIN[p.slot] > 0 && !['out', 'rest'].includes(avail(p)))
        // Starting five: the usual starters, with the first available bench players filling in
        const preferred = roster.filter((p) => (swap ? p.slot < 4 || p.slot === 5 : p.slot < 5))
        const starters = new Set(preferred.filter((p) => rotation.includes(p)).map((p) => p.id))
        for (const p of rotation) if (starters.size < 5) starters.add(p.id)
        const weights = rotation.map((p) => SLOT_USG[p.slot] * between(0.7, 1.3))
        const wsum = weights.reduce((a, b) => a + b, 0)
        const split = (total: number) => {
          const raw = weights.map((w) => (total * w) / wsum)
          const out = raw.map(Math.floor)
          let rest = total - out.reduce((a, b) => a + b, 0)
          raw.map((x, i) => [x - Math.floor(x), i] as const).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (rest-- > 0) out[i] += 1 })
          return out
        }
        const fg3m = split(us.fg3m), fg3a = split(us.fg3a), fg2m = split(us.fgm - us.fg3m), fg2a = split(us.fga - us.fg3a)
        const ftm = split(us.ftm), fta = split(us.fta), oreb = split(us.oreb), dreb = split(us.dreb)
        const ast = split(us.ast), stl = split(us.stl), blk = split(us.blk), tov = split(us.tov)
        const margin = us.pts - them.pts
        rotation.forEach((p, i) => {
          const fgaI = Math.max(fg2a[i], fg2m[i]) + Math.max(fg3a[i], fg3m[i])
          const fgmI = fg2m[i] + fg3m[i]
          const ftaI = Math.max(fta[i], ftm[i])
          const pts = 2 * fg2m[i] + 3 * fg3m[i] + ftm[i]
          const limit = avail(p) === 'limited' ? 0.5 : 1 // first game back from injury
          const minutes = Math.max(4, (SLOT_MIN[p.slot] + between(-4, 4)) * limit)
          const started = starters.has(p.id)
          logRows.push({
            playerId: p.id, teamId, gameId, season: SEASON, seasonId: SEASON, gameDate,
            homeAway: isHome ? HomeAway.HOME : HomeAway.AWAY, result: margin > 0 ? WinLoss.W : WinLoss.L,
            minutes: Math.round(minutes * 10) / 10, points: pts,
            fieldGoals: fgmI, fieldGoalAtt: fgaI, fieldGoalPct: fgaI ? r3(fgmI / fgaI) : null,
            threePointers: fg3m[i], threePointAtt: Math.max(fg3a[i], fg3m[i]),
            threePointPct: fg3a[i] ? r3(fg3m[i] / Math.max(fg3a[i], fg3m[i])) : null,
            freeThrows: ftm[i], freeThrowAtt: ftaI, freeThrowPct: ftaI ? r3(ftm[i] / ftaI) : null,
            reboundsOff: oreb[i], reboundsDef: dreb[i], reboundsTotal: oreb[i] + dreb[i],
            assists: ast[i], steals: stl[i], blocks: blk[i], turnovers: tov[i], personalFouls: int(0, 5),
            plusMinus: Math.round(margin * (minutes / 48) + between(-6, 6)), started,
          })
        })
        // A coach's-decision rest day is logged as a DNP row with a reason
        for (const p of roster.filter((x) => avail(x) === 'rest')) {
          logRows.push({
            playerId: p.id, teamId, gameId, season: SEASON, seasonId: SEASON, gameDate,
            homeAway: isHome ? HomeAway.HOME : HomeAway.AWAY, result: margin > 0 ? WinLoss.W : WinLoss.L,
            minutes: 0, points: 0, plusMinus: null, dnp: true, dnpReason: 'Rest',
          })
        }
      }
    }
  })

  await prisma.gameBoxScore.createMany({ data: gameRows })
  await prisma.playerGameLog.createMany({ data: logRows })
  await prisma.scheduledGame.createMany({ data: scheduleRows })

  // Season stats: current from logs, previous synthetic
  const statRows: Prisma.PlayerSeasonStatsCreateManyInput[] = []
  const logsBy = new Map<string, typeof logRows>()
  for (const l of logRows) {
    if (!logsBy.has(l.playerId)) logsBy.set(l.playerId, [])
    logsBy.get(l.playerId)!.push(l)
  }
  for (const p of players) {
    const logs = logsBy.get(p.id) ?? []
    if (logs.length) {
      const n = logs.length
      const s = (f: (l: (typeof logRows)[number]) => number) => logs.reduce((a, l) => a + f(l), 0)
      const fga = s((l) => l.fieldGoalAtt ?? 0), fta = s((l) => l.freeThrowAtt ?? 0), pts = s((l) => l.points ?? 0)
      const fg3a = s((l) => l.threePointAtt ?? 0), fta2 = fta
      statRows.push({
        playerId: p.id, teamId: p.teamId, season: SEASON, seasonId: SEASON,
        gamesPlayed: n, gamesStarted: logs.filter((l) => l.started).length,
        minutesPerGame: s((l) => l.minutes ?? 0) / n, pointsPerGame: pts / n,
        fieldGoalPct: fga ? s((l) => l.fieldGoals ?? 0) / fga : null,
        threePointersPerGame: s((l) => l.threePointers ?? 0) / n, threePointAttPerGame: fg3a / n,
        threePointPct: fg3a ? s((l) => l.threePointers ?? 0) / fg3a : null,
        freeThrowPct: fta2 ? s((l) => l.freeThrows ?? 0) / fta2 : null,
        reboundsPerGame: s((l) => l.reboundsTotal ?? 0) / n, assistsPerGame: s((l) => l.assists ?? 0) / n,
        stealsPerGame: s((l) => l.steals ?? 0) / n, blocksPerGame: s((l) => l.blocks ?? 0) / n,
        turnoversPerGame: s((l) => l.turnovers ?? 0) / n, plusMinusPerGame: s((l) => l.plusMinus ?? 0) / n,
        trueShootingPct: fga + fta ? pts / (2 * (fga + 0.44 * fta)) : null,
        usageRate: 0.12 + SLOT_USG[p.slot] * 0.1 + between(-0.01, 0.01),
        netRating: s((l) => l.plusMinus ?? 0) / n * 2.1,
      })
    }
    if (p.prevTeamId) {
      const usg = SLOT_USG[Math.max(0, p.slot - 1)] || 0.3
      statRows.push({
        playerId: p.id, teamId: p.prevTeamId, season: PREV, seasonId: PREV,
        gamesPlayed: int(48, 80), gamesStarted: p.slot < 5 ? int(30, 75) : int(0, 15),
        minutesPerGame: Math.max(9, (SLOT_MIN[p.slot] || 10) + between(-5, 3)),
        pointsPerGame: 4 + usg * 13 + between(-2, 2), reboundsPerGame: between(2, 9), assistsPerGame: between(0.8, 7),
        stealsPerGame: between(0.3, 1.5), blocksPerGame: between(0.1, 1.4), turnoversPerGame: between(0.5, 3),
        fieldGoalPct: between(0.41, 0.56), threePointPct: between(0.31, 0.41), threePointAttPerGame: between(0.5, 7),
        freeThrowPct: between(0.68, 0.89), trueShootingPct: between(0.53, 0.63),
        usageRate: 0.12 + usg * 0.1, plusMinusPerGame: between(-4, 5), netRating: between(-8, 9),
      })
    }
  }
  await prisma.playerSeasonStats.createMany({ data: statRows })

  // Standings computed from results
  const rec = new Map(teamIds.map((id) => [id, { w: 0, l: 0, hw: 0, hl: 0, aw: 0, al: 0, results: [] as string[], pf: 0, pa: 0 }]))
  for (const g of gameRows) {
    const homeWon = g.homePoints > g.awayPoints
    const h = rec.get(g.homeTeamId)!, a = rec.get(g.awayTeamId)!
    h.pf += g.homePoints; h.pa += g.awayPoints; a.pf += g.awayPoints; a.pa += g.homePoints
    if (homeWon) { h.w++; h.hw++; a.l++; a.al++; h.results.push('W'); a.results.push('L') }
    else { a.w++; a.aw++; h.l++; h.hl++; a.results.push('W'); h.results.push('L') }
  }
  const standingRows: Prisma.StandingCreateManyInput[] = []
  for (const conf of ['EAST', 'WEST'] as const) {
    const confTeams = TEAMS.filter((t) => t[4] === conf).map((t) => t[0])
      .sort((x, y) => rec.get(y)!.w - rec.get(x)!.w || rec.get(x)!.l - rec.get(y)!.l)
    const leader = rec.get(confTeams[0])!
    confTeams.forEach((id, i) => {
      const t = rec.get(id)!
      const last = t.results[t.results.length - 1]
      let streak = 0
      for (let k = t.results.length - 1; k >= 0 && t.results[k] === last; k--) streak++
      const l10 = t.results.slice(-10)
      standingRows.push({
        teamId: id, season: SEASON, seasonId: SEASON, asOfDate: new Date(new Date().toISOString().slice(0, 10)),
        wins: t.w, losses: t.l, winPct: t.w / Math.max(1, t.w + t.l),
        gamesBehind: (leader.w - t.w + t.l - leader.l) / 2, streak: last ? `${last}${streak}` : null,
        lastTenWins: l10.filter((x) => x === 'W').length, lastTenLosses: l10.filter((x) => x === 'L').length,
        conferenceRank: i + 1, homeWins: t.hw, homeLosses: t.hl, awayWins: t.aw, awayLosses: t.al,
        pointsFor: t.pf / Math.max(1, t.w + t.l), pointsAgainst: t.pa / Math.max(1, t.w + t.l),
        pointDiff: (t.pf - t.pa) / Math.max(1, t.w + t.l),
      })
    })
  }
  await prisma.standing.createMany({ data: standingRows })

  // Lakers 5-man lineups
  const lal = rosterBy.get(FOCUS_TEAM_ID)!
  const combos = [[0, 1, 2, 3, 4], [0, 1, 2, 3, 5], [0, 5, 6, 7, 4], [1, 5, 6, 8, 9], [0, 1, 6, 7, 4]]
  await prisma.lineupStats.createMany({
    data: combos.map((c, i) => {
      const ids = c.map((s) => lal[s].id)
      const off = between(108, 124), def = between(106, 120)
      return {
        teamId: FOCUS_TEAM_ID, season: SEASON, seasonId: SEASON,
        player1Id: ids[0], player2Id: ids[1], player3Id: ids[2], player4Id: ids[3], player5Id: ids[4],
        lineupKey: [...ids].sort().join('-'), gamesPlayed: Math.max(1, ROUNDS - i * 3),
        totalMinutes: Math.max(8, 160 - i * 35 + between(-10, 10)),
        offRating: off, defRating: def, netRating: off - def, pace: between(97, 103),
      }
    }),
  })

  // A couple of injuries: one Lakers player, one on the next opponent
  const nextOpp = scheduleRows.find((g) => g.status === 1 && (g.homeTeamId === FOCUS_TEAM_ID || g.awayTeamId === FOCUS_TEAM_ID))
  const oppId = nextOpp ? (nextOpp.homeTeamId === FOCUS_TEAM_ID ? nextOpp.awayTeamId : nextOpp.homeTeamId) : teamIds[0]
  const fetchedAt = new Date()
  const injured = [
    { p: lal[7], status: 'Day-To-Day', injuryType: 'Ankle', detail: 'Demo: sprained left ankle, questionable for next game.' },
    { p: rosterBy.get(oppId)![1], status: 'Out', injuryType: 'Hamstring', detail: 'Demo: right hamstring strain, re-evaluated in 1 week.' },
  ]
  await prisma.playerInjury.createMany({
    data: injured.map(({ p, ...rest }) => ({
      source: 'demo', teamId: p.teamId, playerId: p.id, playerName: `${p.first} ${p.last}`, fetchedAt, ...rest,
    })),
  })

  console.log(
    `[demo-seed] ${TEAMS.length} teams, ${players.length} players, ${gameRows.length} games, ${logRows.length} logs, ` +
      `${scheduleRows.length - gameRows.length} upcoming, ${statRows.length} season-stat rows`,
  )
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())

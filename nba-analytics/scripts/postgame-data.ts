/**
 * Post-game data for one focus-team game, straight from the NBA live feed (no dev server, no DB).
 *
 * Usage:
 *   npx tsx scripts/postgame-data.ts 0022600112 > /tmp/postgame.json
 *
 * Prints PostgameFacts as JSON (see src/lib/analytics/postgame.ts). Exits 1 if the game isn't
 * final or the numbers don't add up (`checks`); `warnings` (e.g. score corrections) go to stderr
 * without failing. Like the ETL, it must run from a home connection.
 */
import { fetchBoxScore, fetchPlayByPlay } from '../src/app/api/_lib/nbaLive'
import { buildPostgame } from '../src/lib/analytics/postgame'
import { FOCUS_TEAM_ID } from '../src/lib/constants'

async function main() {
  const gameId = process.argv[2]
  if (!gameId || !/^\d{10}$/.test(gameId)) {
    console.error('Usage: npx tsx scripts/postgame-data.ts <10-digit NBA game id>')
    process.exit(2)
  }
  const box = await fetchBoxScore(gameId)
  if (!box) {
    console.error(`No box score for ${gameId} (not started, wrong id, or the feed is blocked)`)
    process.exit(1)
  }
  if (![box.homeTeam.teamId, box.awayTeam.teamId].map(String).includes(FOCUS_TEAM_ID)) {
    console.error(`Game ${gameId} is ${box.awayTeam.teamTricode} @ ${box.homeTeam.teamTricode}; it doesn't involve the focus team`)
    process.exit(2)
  }
  const facts = buildPostgame(box, await fetchPlayByPlay(gameId), FOCUS_TEAM_ID, new Date())
  console.log(JSON.stringify(facts, null, 2))
  if (!facts.final) console.error(`Game ${gameId} is not final (${facts.game.statusText})`)
  for (const c of facts.checks) console.error(`CHECK FAILED: ${c}`)
  for (const w of facts.warnings) console.error(`WARNING: ${w}`)
  // exitCode, not process.exit(): stdout to a pipe is async and exiting now could truncate the JSON
  process.exitCode = facts.final && !facts.checks.length ? 0 : 1
}

main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})

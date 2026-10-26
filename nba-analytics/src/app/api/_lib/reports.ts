import { existsSync } from 'fs'
import { readdir, readFile } from 'fs/promises'
import path from 'path'
import { parseReportName, reportTitle } from '@/lib/reportNames'
import type { ReportMeta } from '@/lib/dashboard-types'

/**
 * Saved game reports: the markdown files Claude Code writes to <repo>/scouting/ with the
 * scouting-report and postgame-report skills. Read from disk, so this works where the repo is
 * checked out (local dev), not from a deployed build. Override the folder with SCOUTING_DIR.
 */
function resolveScoutingDir(): string {
  if (process.env.SCOUTING_DIR) return path.resolve(process.env.SCOUTING_DIR)
  // `next dev` normally runs in nba-analytics/ (folder is ../scouting); also accept the repo root
  const candidates = [path.resolve(process.cwd(), '..', 'scouting'), path.resolve(process.cwd(), 'scouting')]
  return candidates.find((dir) => existsSync(dir)) ?? candidates[0]
}

export const SCOUTING_DIR = resolveScoutingDir()

export async function listReports(focusAbbr: string): Promise<ReportMeta[]> {
  let files: string[]
  try {
    files = await readdir(SCOUTING_DIR)
  } catch (e) {
    // say why the panel is empty instead of looking like "no reports yet"
    console.warn(`Reports folder not readable at ${SCOUTING_DIR} (set SCOUTING_DIR): ${(e as Error).message}`)
    return []
  }
  const metas = files.flatMap((f) => {
    const meta = parseReportName(f, focusAbbr)
    return meta && f.endsWith('.md') ? [meta] : []
  })
  const withTitles = await Promise.all(
    metas.map(async (m) => ({ ...m, title: reportTitle(await readFile(path.join(SCOUTING_DIR, `${m.slug}.md`), 'utf8')) ?? m.slug })),
  )
  // newest game first; post-game before pre-game for the same game
  return withTitles.sort((a, b) => b.gameKey.localeCompare(a.gameKey) || (a.kind === 'postgame' ? -1 : 1))
}

/** Markdown for one report, or null if the slug isn't a valid report name or the file doesn't exist. */
export async function readReport(slug: string, focusAbbr: string): Promise<{ meta: ReportMeta; markdown: string } | null> {
  const meta = parseReportName(slug, focusAbbr)
  if (!meta) return null
  try {
    const markdown = await readFile(path.join(SCOUTING_DIR, `${meta.slug}.md`), 'utf8')
    return { meta: { ...meta, title: reportTitle(markdown) ?? meta.slug }, markdown }
  } catch {
    return null
  }
}

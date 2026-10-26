import { successResponse, serverError } from '@/app/api/_lib/response'
import { listReports } from '@/app/api/_lib/reports'
import { FOCUS_TEAM_ABBR } from '@/lib/constants'
import type { ReportMeta } from '@/lib/dashboard-types'

/** Saved pre-game and post-game reports (scouting/*.md), newest game first. */
export async function GET() {
  try {
    const body: ReportMeta[] = await listReports(FOCUS_TEAM_ABBR)
    return successResponse(body)
  } catch (e) {
    console.error('GET /api/reports failed', e)
    return serverError()
  }
}

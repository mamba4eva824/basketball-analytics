import { successResponse, notFound, serverError } from '@/app/api/_lib/response'
import { readReport } from '@/app/api/_lib/reports'
import { FOCUS_TEAM_ABBR } from '@/lib/constants'
import type { ReportContent } from '@/lib/dashboard-types'

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params
    // readReport only accepts game-report slugs, so no path can escape the scouting folder
    const report = await readReport(slug, FOCUS_TEAM_ABBR)
    if (!report) return notFound(`Report ${slug} not found`)
    const body: ReportContent = { ...report.meta, markdown: report.markdown }
    return successResponse(body)
  } catch (e) {
    console.error('GET /api/reports/[slug] failed', e)
    return serverError()
  }
}

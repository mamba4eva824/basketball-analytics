/**
 * Standardized API response helpers.
 *
 * Every API response follows:
 *   Success: { success: true,  data: T, meta?: { total, page, pageSize } }
 *   Error:   { success: false, error: { code: string, message: string } }
 */

export interface ApiMeta {
  total: number
  page: number
  pageSize: number
}

export interface ApiSuccessResponse<T> {
  success: true
  data: T
  meta?: ApiMeta
}

export interface ApiErrorResponse {
  success: false
  error: {
    code: string
    message: string
  }
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse

// ── Helpers ──────────────────────────────────────

export function successResponse<T>(data: T, meta?: ApiMeta, status = 200): Response {
  const body: ApiSuccessResponse<T> = { success: true, data }
  if (meta) body.meta = meta
  return Response.json(body, { status })
}

export function errorResponse(
  code: string,
  message: string,
  status = 400,
): Response {
  const body: ApiErrorResponse = {
    success: false,
    error: { code, message },
  }
  return Response.json(body, { status })
}

export function notFound(message = 'Resource not found'): Response {
  return errorResponse('NOT_FOUND', message, 404)
}

export function badRequest(message: string): Response {
  return errorResponse('BAD_REQUEST', message, 400)
}

export function serverError(message = 'Internal server error'): Response {
  return errorResponse('INTERNAL_ERROR', message, 500)
}

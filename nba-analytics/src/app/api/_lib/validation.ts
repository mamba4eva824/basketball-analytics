import { z } from 'zod'

/**
 * Shared Zod schemas used across multiple API routes.
 */

// Season string like "2025-26"
export const seasonSchema = z
  .string()
  .regex(/^\d{4}-\d{2}$/, 'Season must be in format YYYY-YY (e.g. 2025-26)')

// Pagination
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
})

// Sort direction
export const sortDirectionSchema = z.enum(['asc', 'desc']).default('desc')

// Conference filter
export const conferenceSchema = z.enum(['EAST', 'WEST', 'East', 'West', 'east', 'west'])

// Date string (ISO-like)
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD')

// Positive integer coerced from string query param
export const positiveIntSchema = z.coerce.number().int().min(1)

/**
 * Helper: parse search params with a zod schema, returning either
 * the validated data or a string error message.
 */
export function parseSearchParams<T extends z.ZodType>(
  searchParams: URLSearchParams,
  schema: T,
): { success: true; data: z.infer<T> } | { success: false; error: string } {
  // Convert URLSearchParams to a plain object (single values only)
  const raw: Record<string, string> = {}
  searchParams.forEach((value, key) => {
    raw[key] = value
  })

  const result = schema.safeParse(raw)
  if (result.success) {
    return { success: true, data: result.data }
  }

  // Flatten errors into a readable string
  const messages = result.error.issues.map(
    (issue) => `${issue.path.join('.')}: ${issue.message}`,
  )
  return { success: false, error: messages.join('; ') }
}

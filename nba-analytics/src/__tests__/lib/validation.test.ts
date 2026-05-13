import { describe, test, expect } from 'vitest'
import {
  seasonSchema,
  paginationSchema,
  sortDirectionSchema,
  conferenceSchema,
  dateSchema,
  positiveIntSchema,
  parseSearchParams,
} from '@/app/api/_lib/validation'
import { z } from 'zod'

describe('seasonSchema', () => {
  test('accepts valid season format YYYY-YY', () => {
    expect(seasonSchema.parse('2025-26')).toBe('2025-26')
    expect(seasonSchema.parse('2025-26')).toBe('2025-26')
    expect(seasonSchema.parse('1999-00')).toBe('1999-00')
  })

  test('rejects invalid season formats', () => {
    expect(() => seasonSchema.parse('2024')).toThrow()
    expect(() => seasonSchema.parse('2024-2025')).toThrow()
    expect(() => seasonSchema.parse('abcd-ef')).toThrow()
    expect(() => seasonSchema.parse('')).toThrow()
    expect(() => seasonSchema.parse('24-25')).toThrow()
  })
})

describe('paginationSchema', () => {
  test('provides defaults when no values given', () => {
    const result = paginationSchema.parse({})

    expect(result.page).toBe(1)
    expect(result.pageSize).toBe(25)
  })

  test('accepts valid page and pageSize', () => {
    const result = paginationSchema.parse({ page: '3', pageSize: '50' })

    expect(result.page).toBe(3)
    expect(result.pageSize).toBe(50)
  })

  test('coerces string values to numbers', () => {
    const result = paginationSchema.parse({ page: '2', pageSize: '10' })

    expect(result.page).toBe(2)
    expect(result.pageSize).toBe(10)
  })

  test('rejects page less than 1', () => {
    expect(() => paginationSchema.parse({ page: '0' })).toThrow()
    expect(() => paginationSchema.parse({ page: '-1' })).toThrow()
  })

  test('rejects pageSize greater than 100', () => {
    expect(() => paginationSchema.parse({ pageSize: '101' })).toThrow()
  })

  test('rejects pageSize less than 1', () => {
    expect(() => paginationSchema.parse({ pageSize: '0' })).toThrow()
  })
})

describe('sortDirectionSchema', () => {
  test('accepts asc and desc', () => {
    expect(sortDirectionSchema.parse('asc')).toBe('asc')
    expect(sortDirectionSchema.parse('desc')).toBe('desc')
  })

  test('defaults to desc', () => {
    expect(sortDirectionSchema.parse(undefined)).toBe('desc')
  })

  test('rejects invalid values', () => {
    expect(() => sortDirectionSchema.parse('up')).toThrow()
    expect(() => sortDirectionSchema.parse('ASC')).toThrow()
  })
})

describe('conferenceSchema', () => {
  test('accepts valid conference values', () => {
    expect(conferenceSchema.parse('EAST')).toBe('EAST')
    expect(conferenceSchema.parse('WEST')).toBe('WEST')
    expect(conferenceSchema.parse('East')).toBe('East')
    expect(conferenceSchema.parse('West')).toBe('West')
    expect(conferenceSchema.parse('east')).toBe('east')
    expect(conferenceSchema.parse('west')).toBe('west')
  })

  test('rejects invalid conference values', () => {
    expect(() => conferenceSchema.parse('NORTH')).toThrow()
    expect(() => conferenceSchema.parse('SOUTH')).toThrow()
    expect(() => conferenceSchema.parse('')).toThrow()
  })
})

describe('dateSchema', () => {
  test('accepts valid date format YYYY-MM-DD', () => {
    expect(dateSchema.parse('2025-01-15')).toBe('2025-01-15')
    expect(dateSchema.parse('2024-12-31')).toBe('2024-12-31')
  })

  test('rejects invalid date formats', () => {
    expect(() => dateSchema.parse('2025-1-15')).toThrow()
    expect(() => dateSchema.parse('01-15-2025')).toThrow()
    expect(() => dateSchema.parse('2025/01/15')).toThrow()
    expect(() => dateSchema.parse('')).toThrow()
  })
})

describe('positiveIntSchema', () => {
  test('accepts positive integers', () => {
    expect(positiveIntSchema.parse('1')).toBe(1)
    expect(positiveIntSchema.parse('100')).toBe(100)
    expect(positiveIntSchema.parse(5)).toBe(5)
  })

  test('rejects zero and negative numbers', () => {
    expect(() => positiveIntSchema.parse('0')).toThrow()
    expect(() => positiveIntSchema.parse('-1')).toThrow()
  })

  test('rejects non-integer values', () => {
    expect(() => positiveIntSchema.parse('1.5')).toThrow()
  })
})

describe('parseSearchParams', () => {
  test('returns success with parsed data for valid input', () => {
    const schema = z.object({
      name: z.string(),
      age: z.coerce.number(),
    })

    const params = new URLSearchParams('name=John&age=30')
    const result = parseSearchParams(params, schema)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.name).toBe('John')
      expect(result.data.age).toBe(30)
    }
  })

  test('returns error string for invalid input', () => {
    const schema = z.object({
      season: seasonSchema,
    })

    const params = new URLSearchParams('season=invalid')
    const result = parseSearchParams(params, schema)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(typeof result.error).toBe('string')
      expect(result.error.length).toBeGreaterThan(0)
    }
  })

  test('handles empty search params with defaults', () => {
    const schema = z.object({
      page: z.coerce.number().default(1),
    })

    const params = new URLSearchParams('')
    const result = parseSearchParams(params, schema)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.page).toBe(1)
    }
  })

  test('handles optional fields', () => {
    const schema = z.object({
      required: z.string(),
      optional: z.string().optional(),
    })

    const params = new URLSearchParams('required=hello')
    const result = parseSearchParams(params, schema)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.required).toBe('hello')
      expect(result.data.optional).toBeUndefined()
    }
  })

  test('concatenates multiple validation errors', () => {
    const schema = z.object({
      season: seasonSchema,
      page: z.coerce.number().int().min(1),
    })

    const params = new URLSearchParams('season=bad&page=-1')
    const result = parseSearchParams(params, schema)

    expect(result.success).toBe(false)
    if (!result.success) {
      // Should contain error info for both fields
      expect(result.error).toContain('season')
    }
  })
})

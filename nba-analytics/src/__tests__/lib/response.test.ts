import { describe, test, expect } from 'vitest'
import {
  successResponse,
  errorResponse,
  notFound,
  badRequest,
  serverError,
} from '@/app/api/_lib/response'

describe('successResponse', () => {
  test('returns Response with success: true and data', async () => {
    const data = { foo: 'bar', count: 42 }
    const res = successResponse(data)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data).toEqual(data)
    expect(body.meta).toBeUndefined()
  })

  test('includes meta when provided', async () => {
    const data = [1, 2, 3]
    const meta = { total: 100, page: 2, pageSize: 25 }
    const res = successResponse(data, meta)
    const body = await res.json()

    expect(body.success).toBe(true)
    expect(body.data).toEqual(data)
    expect(body.meta).toEqual(meta)
  })

  test('supports custom status code', async () => {
    const res = successResponse({ id: 1 }, undefined, 201)

    expect(res.status).toBe(201)
  })

  test('default status is 200', async () => {
    const res = successResponse(null)

    expect(res.status).toBe(200)
  })

  test('works with null data', async () => {
    const res = successResponse(null)
    const body = await res.json()

    expect(body.success).toBe(true)
    expect(body.data).toBeNull()
  })

  test('works with array data', async () => {
    const data = [{ id: 1 }, { id: 2 }]
    const res = successResponse(data)
    const body = await res.json()

    expect(body.success).toBe(true)
    expect(body.data).toEqual(data)
  })
})

describe('errorResponse', () => {
  test('returns Response with success: false and error', async () => {
    const res = errorResponse('BAD_REQUEST', 'Missing param')
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.success).toBe(false)
    expect(body.error).toEqual({
      code: 'BAD_REQUEST',
      message: 'Missing param',
    })
  })

  test('supports custom status code', async () => {
    const res = errorResponse('CUSTOM', 'Custom error', 422)

    expect(res.status).toBe(422)
  })

  test('default status is 400', async () => {
    const res = errorResponse('CODE', 'msg')

    expect(res.status).toBe(400)
  })
})

describe('notFound', () => {
  test('returns 404 with NOT_FOUND code', async () => {
    const res = notFound()
    const body = await res.json()

    expect(res.status).toBe(404)
    expect(body.success).toBe(false)
    expect(body.error.code).toBe('NOT_FOUND')
    expect(body.error.message).toBe('Resource not found')
  })

  test('supports custom message', async () => {
    const res = notFound('Player not found')
    const body = await res.json()

    expect(body.error.message).toBe('Player not found')
  })
})

describe('badRequest', () => {
  test('returns 400 with BAD_REQUEST code', async () => {
    const res = badRequest('Invalid season format')
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.success).toBe(false)
    expect(body.error.code).toBe('BAD_REQUEST')
    expect(body.error.message).toBe('Invalid season format')
  })
})

describe('serverError', () => {
  test('returns 500 with INTERNAL_ERROR code', async () => {
    const res = serverError()
    const body = await res.json()

    expect(res.status).toBe(500)
    expect(body.success).toBe(false)
    expect(body.error.code).toBe('INTERNAL_ERROR')
    expect(body.error.message).toBe('Internal server error')
  })

  test('supports custom message', async () => {
    const res = serverError('Database connection failed')
    const body = await res.json()

    expect(body.error.message).toBe('Database connection failed')
  })
})

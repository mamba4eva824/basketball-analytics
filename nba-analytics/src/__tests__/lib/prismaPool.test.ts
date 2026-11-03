import { describe, it, expect } from 'vitest'
import { pooledUrl } from '@/app/api/_lib/prisma'

describe('pooledUrl', () => {
  it('caps the pool on a plain connection string', () => {
    expect(pooledUrl('postgresql://u:p@host:5432/db')).toBe('postgresql://u:p@host:5432/db?connection_limit=5')
  })

  it('appends to existing query parameters', () => {
    expect(pooledUrl('postgresql://u:p@host:5432/db?sslmode=require', 3)).toBe('postgresql://u:p@host:5432/db?sslmode=require&connection_limit=3')
  })

  it('leaves an explicit connection_limit alone', () => {
    expect(pooledUrl('postgresql://u:p@host:5432/db?connection_limit=10')).toBe('postgresql://u:p@host:5432/db?connection_limit=10')
  })

  it('passes through a missing URL', () => {
    expect(pooledUrl(undefined)).toBeUndefined()
  })
})

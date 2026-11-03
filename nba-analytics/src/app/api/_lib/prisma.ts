import { PrismaClient } from '@/generated/prisma/client'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

/**
 * Supabase's session pooler allows 15 clients in all. Prisma's default pool (2 × CPU cores + 1)
 * lets one or two dev servers take every slot, and the ETL then can't connect at all. Cap each
 * server at 5 unless DATABASE_URL already sets connection_limit.
 */
export function pooledUrl(url: string | undefined, limit = 5): string | undefined {
  if (!url || /[?&]connection_limit=/.test(url)) return url
  return `${url}${url.includes('?') ? '&' : '?'}connection_limit=${limit}`
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ datasourceUrl: pooledUrl(process.env.DATABASE_URL) })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

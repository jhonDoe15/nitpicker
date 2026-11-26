import type { Prisma, PrismaClient } from '@prisma/client';
export function authConfig(db: PrismaClient): { url: string } { return { url: String(db) }; }
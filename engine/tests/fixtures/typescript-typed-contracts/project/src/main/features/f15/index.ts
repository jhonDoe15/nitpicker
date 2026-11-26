import type { Prisma, PrismaClient } from '@prisma/client';
export function findUsers(db: PrismaClient): Promise<string[]> { return Promise.resolve([String(db)]); }
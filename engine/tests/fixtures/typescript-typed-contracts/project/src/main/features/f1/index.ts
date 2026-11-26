import type { Prisma, PrismaClient } from '@prisma/client';
export function createOrders(db: PrismaClient) { return { list: (): Promise<string[]> => Promise.resolve([String(db)]) }; }
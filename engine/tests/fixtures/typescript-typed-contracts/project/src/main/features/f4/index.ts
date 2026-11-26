import type { Prisma, PrismaClient } from '@prisma/client';
export interface OrderDeps { db: PrismaClient }
export type OrderView = { id: string };
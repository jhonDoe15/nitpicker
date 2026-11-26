import type { Prisma, PrismaClient } from '@prisma/client';
declare const c: PrismaClient | undefined;
export const db = c;
export declare const both: PrismaClient | Prisma.TransactionClient;

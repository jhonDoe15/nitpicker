import type { Prisma, PrismaClient } from '@prisma/client';
export class Users { static find(db: PrismaClient): Promise<string[]> { return Promise.resolve([String(db)]); } }
import type { Prisma, PrismaClient } from '@prisma/client';
export default class Orders { find(db: PrismaClient): string { return String(db); } }

import type { Prisma, PrismaClient } from '@prisma/client';
export default function (db: PrismaClient): string { return String(db); }

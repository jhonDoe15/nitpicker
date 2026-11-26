import type { Prisma, PrismaClient } from '@prisma/client';
export function a(db: PrismaClient, other: PrismaClient): PrismaClient { return db ?? other; }
export function b(db: PrismaClient): void { void db; }

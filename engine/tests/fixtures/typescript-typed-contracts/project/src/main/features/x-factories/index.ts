import type { Prisma, PrismaClient } from '@prisma/client';
export function f1(db: PrismaClient) { return { a: () => db, b(): string { return ''; } }; }
export function f2() { return { async a(): Promise<PrismaClient> { throw new Error(''); } }; }
export function f3() { return [() => 1]; }
export function f4(db: PrismaClient) { return () => ({ tx(): Prisma.TransactionClient { return db; } }); }
export const f5 = (db: PrismaClient) => ({ db });
export class K5 { m() { return { x(db: PrismaClient): void { void db; } }; } }

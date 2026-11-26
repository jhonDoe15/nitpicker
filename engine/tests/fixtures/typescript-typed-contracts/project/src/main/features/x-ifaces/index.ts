import type { Prisma, PrismaClient } from '@prisma/client';
export interface Fn { (db: PrismaClient): void; method(): Prisma.TransactionClient; readonly prop: () => PrismaClient; other: string }
export type Alias = (db: PrismaClient) => void;
export type Obj = { run(db: PrismaClient): void; nested: { inner(db: PrismaClient): void } };

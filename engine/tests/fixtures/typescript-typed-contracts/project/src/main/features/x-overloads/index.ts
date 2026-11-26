import type { Prisma, PrismaClient } from '@prisma/client';
export function ov(a: string): void;
export function ov(a: PrismaClient): void;
export function ov(a: unknown): void { void a; }
export function merged(db: PrismaClient): void { void db; }
export namespace merged { export function inner(db: PrismaClient): void { void db; } export const x = 1; }
export class Mc { m(db: PrismaClient): void { void db; } }
export namespace Mc { export function st(db: PrismaClient): void { void db; } }

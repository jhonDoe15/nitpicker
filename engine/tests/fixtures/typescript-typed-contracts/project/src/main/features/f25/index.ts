import type { PrismaClient } from '../../../generated/prisma';
export function findUsers(db: PrismaClient): Promise<string[]> { return Promise.resolve([String(db)]); }
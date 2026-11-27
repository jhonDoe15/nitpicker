import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
declare const ids: string[];
declare function use(value: unknown): void;
export async function run() { await Promise.all(ids.map((id) => prisma.user.findUnique({ where: { id } }))); }
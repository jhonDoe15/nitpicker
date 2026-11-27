import { Prisma } from '@prisma/client';
for (const id of ids) { parts.push(Prisma.sql`id = ${id}`); }
export {};

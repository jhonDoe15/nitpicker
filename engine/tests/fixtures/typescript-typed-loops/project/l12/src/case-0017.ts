import { Prisma } from '@prisma/client';
for (const id of ids) { return Prisma.sql`id = ${id}`; }
export {};

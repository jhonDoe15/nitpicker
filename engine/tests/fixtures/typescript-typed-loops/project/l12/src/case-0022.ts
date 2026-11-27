import { Prisma } from '@prisma/client';
for (const id of ids) { await prisma.$queryRaw(Prisma.sql`select 1 where id = ${id}`); }
export {};

import { Prisma } from '@prisma/client';
for (const id of ids) { await prisma.$executeRaw(Prisma.sql`delete from t where id = ${id}`); }
export {};

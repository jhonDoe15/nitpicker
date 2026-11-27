import { Prisma } from '@prisma/client';
for (const id of ids) { await prisma.$queryRawUnsafe(`select ${id}`); }
export {};

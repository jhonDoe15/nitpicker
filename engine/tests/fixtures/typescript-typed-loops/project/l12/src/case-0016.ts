import { Prisma } from '@prisma/client';
for (const id of ids) { const fragment = Prisma.sql`ARRAY[${Prisma.join(values.map((v) => Prisma.sql`${v}`))}]`; }
export {};

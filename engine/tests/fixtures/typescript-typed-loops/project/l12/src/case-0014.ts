import { Prisma } from '@prisma/client';
for (const id of ids) { parts.push(Prisma.join(values, ", ")); }
export {};

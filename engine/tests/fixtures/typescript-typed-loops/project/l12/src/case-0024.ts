import { Prisma } from '@prisma/client';
for (const id of ids) { await prisma.user.findUnique({ where: { id } }); }
export {};

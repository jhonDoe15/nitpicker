import { PrismaClient } from '@prisma/client';
export const prisma = new PrismaClient();
export async function syncWorkspace(id: string) { await prisma.order.update({ where: { id }, data: {} }); }

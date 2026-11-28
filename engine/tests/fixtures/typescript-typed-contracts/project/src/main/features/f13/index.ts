import type { Prisma, PrismaClient } from '@prisma/client';
import { router } from '@trpc/server';
export const appRouter = router({ db: {} as PrismaClient });
export type AppRouter = typeof appRouter;
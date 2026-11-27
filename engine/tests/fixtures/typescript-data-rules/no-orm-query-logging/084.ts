import { PrismaClient } from "@prisma/client"; export const prisma = new PrismaClient({ log: isDev ? ["query"] : [] });

import { PrismaClient } from "@prisma/client"; export const prisma = new PrismaClient({ ...x, log: ["query"] });

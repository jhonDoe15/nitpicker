import { PrismaClient } from "@prisma/client"; export class Db extends PrismaClient { constructor() { super({ log: isDev ? ["query"] : [] }); } }

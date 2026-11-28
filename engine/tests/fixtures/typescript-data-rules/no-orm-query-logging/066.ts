import { drizzle, DefaultLogger } from "drizzle-orm/node-postgres"; export const db = drizzle(pool, { logger: new DefaultLogger() });

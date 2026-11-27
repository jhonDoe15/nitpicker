import { drizzle as dz, DefaultLogger } from "drizzle-orm/node-postgres"; export const db = dz(pool, { logger: new DefaultLogger() });

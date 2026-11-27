import { drizzle } from "drizzle-orm/node-postgres"; export const db = drizzle(pool, { logger: process.env.SQL_LOG === "1" });

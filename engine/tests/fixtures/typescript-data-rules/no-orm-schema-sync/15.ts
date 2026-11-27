import { DataSource } from "typeorm"; export async function start(db) { await db.runMigrations(); }

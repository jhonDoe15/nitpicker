import { eq, inArray } from "drizzle-orm";
export async function run(db, orders) { const rows = await db.select().from(orders); await db.insert(orders).values(rows.map((row) => row.id)); }
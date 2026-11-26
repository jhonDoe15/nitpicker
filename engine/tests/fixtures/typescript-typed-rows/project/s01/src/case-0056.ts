import { eq, inArray } from "drizzle-orm";
export async function run(db, orders) { const rows = await db.select().from(orders); await db.delete(orders).where(inArray(orders.id, rows.map((row) => row.id)));
return rows; }
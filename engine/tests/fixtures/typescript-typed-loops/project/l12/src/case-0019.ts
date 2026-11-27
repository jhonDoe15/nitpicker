import { eq, and, or, isNull, isNotNull, inArray, sql } from 'drizzle-orm';
for (const id of ids) { await db.execute(sql`select 1 where id = ${id}`); }
export {};

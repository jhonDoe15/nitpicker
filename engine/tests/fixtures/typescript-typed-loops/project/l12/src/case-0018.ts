import { eq, and, or, isNull, isNotNull, inArray, sql } from 'drizzle-orm';
for (const id of ids) { await db.select().from(users).where(eq(users.id, id)); }
export {};

import { eq, and, or, isNull, isNotNull, inArray, sql } from 'drizzle-orm';
for (const id of ids) { await db.delete(users).where(and(eq(users.id, id), isNull(users.deletedAt))); }
export {};

import { eq, and, or, isNull, isNotNull, inArray, sql } from 'drizzle-orm';
for (const id of ids) { conditions.push(and(eq(table.id, id), isNull(table.deletedAt))); }
export {};

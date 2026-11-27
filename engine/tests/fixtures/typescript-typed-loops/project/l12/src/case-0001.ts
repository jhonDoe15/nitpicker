import { eq, and, or, isNull, isNotNull, inArray, sql } from 'drizzle-orm';
for (const id of ids) { conditions.push(eq(table.id, id)); }
export {};

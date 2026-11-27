import { eq, and, or, isNull, isNotNull, inArray, sql } from 'drizzle-orm';
for (const id of ids) { conditions.push(or(isNotNull(table.a), inArray(table.b, [id]))); }
export {};

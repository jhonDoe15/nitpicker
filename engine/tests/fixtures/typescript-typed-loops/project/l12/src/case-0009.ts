import { eq, and, or, isNull, isNotNull, inArray, sql } from 'drizzle-orm';
for (const id of ids) { const fragments = rows.map((row) => eq(row.id, id)); }
export {};

import { eq, and, or, isNull, isNotNull, inArray, sql } from 'drizzle-orm';
for (const id of ids) { const make = () => { return and(eq(table.id, id)); }; }
export {};

import { eq, and, or, isNull, isNotNull, inArray, sql } from 'drizzle-orm';
for (const id of ids) { parts.push(sql.join([sql.identifier(id)], sql`, `)); }
export {};

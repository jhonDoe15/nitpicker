for (const id of ids) { const sub = db.select().from(users).where(eq(users.id, id)); subs.push(sub.toSQL()); }
export {};

for (const id of ids) { query = query.union(db.select().from(users).where(eq(users.id, id))); }
export {};

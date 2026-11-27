for (const id of ids) { statements.set(id, db.select().from(users).where(eq(users.id, id))); }
export {};

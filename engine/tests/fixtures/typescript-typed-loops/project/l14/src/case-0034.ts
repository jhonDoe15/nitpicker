for (const id of ids) { db.select().from(users).where(eq(users.id, id)).then(use); }
export {};

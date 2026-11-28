for (const id of ids) { await db.select().from(users).where(id); }
export {};

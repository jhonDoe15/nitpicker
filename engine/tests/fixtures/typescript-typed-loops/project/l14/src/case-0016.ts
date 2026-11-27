for (const id of ids) { const condition = { rows: db.select().from(users).where(eq(users.id, id)) }; use(condition); }
export {};

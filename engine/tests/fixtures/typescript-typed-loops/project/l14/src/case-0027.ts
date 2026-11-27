for (const id of ids) { const rows = await db.select().from(users).where(eq(users.id, id)); }
export {};

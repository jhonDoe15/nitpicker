for (const id of ids) { const query = db.select().from(users).where(eq(users.id, id)); const rows = await query; }
export {};

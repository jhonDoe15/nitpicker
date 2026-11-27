for (let i = 0; i < ids.length; i++) { const rows = await db.select().from(users).where(eq(users.id, ids[i])).limit(1); if (!rows.length) break; }
export {};

for (const workspace of workspaces) { await db.select().from(users).where(inArray(users.id, allIds)); }
export {};

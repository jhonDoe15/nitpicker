await Promise.all(ids.map((id) => db.select().from(users).where(eq(users.id, id))));
export {};

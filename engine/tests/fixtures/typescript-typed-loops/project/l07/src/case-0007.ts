for (const post of posts) { await db.select().from(users).where(eq(users.id, post.authorId)); }
export {};

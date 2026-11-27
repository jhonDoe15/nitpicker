for (const post of posts) { await repo.update(post.authorId, { seen: true }); }
export {};

for (const post of posts) { await repo.findOne({ where: { id: post.authorId } }); }
export {};

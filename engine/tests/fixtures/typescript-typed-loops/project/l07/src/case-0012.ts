for (const post of posts) { await repo.findOne({ where: { id: ids[post.index] } }); }
export {};

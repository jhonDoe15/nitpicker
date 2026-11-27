for (const post of posts) { await repo.findOne({ where: { slug: post.slug } }); }
export {};

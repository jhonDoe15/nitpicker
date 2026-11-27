await Promise.all(posts.map((post) => repository.findOne({ where: { id: post.authorId } })));
export {};

for (const comment of comments) { await prisma.user.findUnique({ where: { id: comment.user_id } }); }
export {};

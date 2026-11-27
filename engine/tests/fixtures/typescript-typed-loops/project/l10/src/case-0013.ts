for (const workspace of workspaces) { await prisma.post.deleteMany({ where: { authorId: { in: workspace.memberIds } } }); }
export {};

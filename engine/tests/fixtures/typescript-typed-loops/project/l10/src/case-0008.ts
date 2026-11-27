for (const workspace of workspaces) { await prisma.user.findMany({ where: { id: { in: allIds } } }); }
export {};

for (const id of ids) { await prisma.user.findMany({ where: { id } }); }
export {};

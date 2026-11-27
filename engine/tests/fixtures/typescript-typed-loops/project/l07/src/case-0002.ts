for (const id of ids) { await prisma.user.findUnique({ where: { id } }); }
export {};

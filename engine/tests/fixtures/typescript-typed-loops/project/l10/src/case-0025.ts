for (const id of ids) { await prisma.user.findMany({ where: { id: { in: [id, other] } } }); }
export {};

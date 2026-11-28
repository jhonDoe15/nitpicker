for (const id of ids) { await prisma.user.findMany({ where: { orgId: id, role: { in: roles } } }); }
export {};

for (const id of ids) { await prisma.user.create({ data: { id } }); }
export {};

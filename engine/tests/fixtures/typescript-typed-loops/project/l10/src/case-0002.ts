for (const part of batches) { await prisma.user.findMany({ where: { id: { in: part } } }); }
export {};

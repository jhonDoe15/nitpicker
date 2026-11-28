await prisma.$transaction(async (tx) => { await tx.order.create({}); cache.set(id, 1); });
export {};

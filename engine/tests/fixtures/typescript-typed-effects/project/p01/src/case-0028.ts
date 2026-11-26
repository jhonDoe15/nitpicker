await prisma.$transaction(async (tx) => { await tx.order.create({}); await fetch(url); });
export {};

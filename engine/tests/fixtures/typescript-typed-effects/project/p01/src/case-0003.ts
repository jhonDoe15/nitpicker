await fetch(url); await prisma.$transaction(async (tx) => tx.order.create({}));
export {};

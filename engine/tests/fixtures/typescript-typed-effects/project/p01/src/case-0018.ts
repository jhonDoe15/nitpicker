await prisma.$transaction(async (tx) => { await tx.order.create({}); if (!token) { token = await fetch(url); } });
export {};

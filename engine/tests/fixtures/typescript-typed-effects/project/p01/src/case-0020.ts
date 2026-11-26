await prisma.$transaction(async (tx) => { await tx.order.create({}); await httpClient.post(url); });
export {};

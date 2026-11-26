await prisma.$transaction(async () => { await fetch(url); });
export {};

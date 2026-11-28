const ops = []; for (const id of ids) { ops.push(prisma.repository.create({ data: { id } })); } await Promise.all(ops);
export {};

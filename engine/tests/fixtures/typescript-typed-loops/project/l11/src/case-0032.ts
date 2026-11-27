const ops = []; ids.forEach((id) => ops.push(prisma.repository.create({ data: { id } }))); return Promise.all(ops);
export {};

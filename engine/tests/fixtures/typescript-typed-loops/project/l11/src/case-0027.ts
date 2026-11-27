for (const id of ids) { const entity = prisma.repository.create({ data }); entity.then(use); }
export {};

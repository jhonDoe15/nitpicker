await Promise.all(ids.map(async (id) => repo.create({ id })));
export {};

await Promise.all(ids.map(async (id) => { return await repository.findById(id); }));
export {};

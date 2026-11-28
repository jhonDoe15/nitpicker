for (const id of ids) { const entity = repo.create({ id }); entity.name = id; return entity; }
export {};

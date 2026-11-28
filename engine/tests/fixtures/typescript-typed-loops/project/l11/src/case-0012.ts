for (const id of ids) { const entity = repo.create({ id }); await repo.save(entity); }
export {};

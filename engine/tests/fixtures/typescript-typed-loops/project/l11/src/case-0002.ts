const entities = []; for (const id of ids) { entities.push(repo.create({ id })); } await repo.save(entities);
export {};

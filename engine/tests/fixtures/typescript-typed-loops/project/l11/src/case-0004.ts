const entities = []; for (const id of ids) { const entity = repository.create({ id }); entities.push(entity); } await repository.insert(entities);
export {};

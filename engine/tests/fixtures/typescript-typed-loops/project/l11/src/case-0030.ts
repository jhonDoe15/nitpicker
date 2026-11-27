for (const id of ids) { const entity = repo.create({ id }); await entity.save(); }
export {};

for (const id of await repository.findByIds(ids)) { use(id); }
export {};

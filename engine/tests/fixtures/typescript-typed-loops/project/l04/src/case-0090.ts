for await (const id of ids) { await repository.findById(id); }
export {};

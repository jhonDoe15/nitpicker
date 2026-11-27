let index = 0; while (index < ids.length) { await repository.findById(ids[index]); index += 1; }
export {};

const pending = []; for (const id of ids) { pending.push(repository.findById(id)); } use(pending);
export {};

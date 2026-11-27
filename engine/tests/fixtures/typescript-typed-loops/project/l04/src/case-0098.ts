const pending = []; for (const id of ids) { pending.push(repository.findById(id)); } await Promise.all(pending);
export {};

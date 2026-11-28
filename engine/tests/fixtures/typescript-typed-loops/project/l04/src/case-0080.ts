const pending = []; for (const id of ids) { pending.push(await repository.findById(id)); } await Promise.all(pending);
export {};

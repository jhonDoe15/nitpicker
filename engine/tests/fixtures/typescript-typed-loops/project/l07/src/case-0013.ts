let parent = start; for (let depth = 0; depth < 5; depth++) { parent = await repo.findById(parent.parentId); }
export {};

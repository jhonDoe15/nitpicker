let i = 0; do { await repository.save(ids[i]); i -= -1; } while (i < ids.length);
export {};

for (const id of ids) { try { await repository.save(id); } catch { log(); } }
export {};

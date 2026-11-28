for (const id of ids) { try { return await repository.findById(id); } catch { log(); } }
export {};

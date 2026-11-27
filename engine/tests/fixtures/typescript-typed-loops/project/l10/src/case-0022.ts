for (const id of ids) { await repo.findOne({ where: { id } }); }
export {};

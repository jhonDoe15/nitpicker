for (const id of ids) { await repo.find({ where: { id: In([id]) } }); }
export {};

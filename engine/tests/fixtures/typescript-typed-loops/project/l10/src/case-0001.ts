for (const part of chunk(ids, 100)) { await repo.find({ where: { id: In(part) } }); }
export {};

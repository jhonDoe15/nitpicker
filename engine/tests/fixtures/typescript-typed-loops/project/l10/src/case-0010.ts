for (const group of groups) { await repo.find({ where: { id: In(group) } }); }
export {};

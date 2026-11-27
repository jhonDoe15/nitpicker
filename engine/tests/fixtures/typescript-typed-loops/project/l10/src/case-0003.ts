for (let i = 0; i < ids.length; i += 100) { await repo.find({ where: { id: In(ids.slice(i, i + 100)) } }); }
export {};

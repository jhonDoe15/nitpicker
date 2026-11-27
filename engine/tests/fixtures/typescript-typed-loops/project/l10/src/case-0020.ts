for (const row of rows) { await repo.find({ where: { id: In([row.id]) } }); }
export {};

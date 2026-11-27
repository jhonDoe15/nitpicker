for (let i = 0; i < ids.length; i++) { const rows = await repo.find({ where: { id: ids[i] }, take: 1 }); if (rows.length === 0) break; }
export {};

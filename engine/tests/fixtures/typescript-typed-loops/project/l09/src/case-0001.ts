for (;;) { const rows = await repo.find({ take: 500 }); if (rows.length === 0) break; await repo.remove(rows); }
export {};

for (;;) { const rows = await repo.find({ take: 500 }); if (!rows.length) return; await repo.remove(rows); }
export {};

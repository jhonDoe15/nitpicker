let rows; do { rows = await repo.find({ take: 100 }); await repo.remove(rows); } while (rows.length === 100);
export {};

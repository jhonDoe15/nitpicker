for (let attempt = 0; attempt < 100; attempt++) { const rows = await repo.find({ take: 50 }); if (rows.length === 0) break; await repo.delete(rows.map((row) => row.id)); }
export {};

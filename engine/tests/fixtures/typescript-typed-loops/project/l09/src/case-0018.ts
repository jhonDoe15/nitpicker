for (;;) { const rows = await repo.find({ take: 500 }); if (rows.length === 0) break; for (const row of rows) { await repo.remove(row); } }
export {};

for (const id of ids) { const rows = await repo.find({ take: 10 }); if (!rows.length) break; }
export {};

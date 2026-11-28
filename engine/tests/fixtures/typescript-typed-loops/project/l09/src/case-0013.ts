while (queue.length) { const parent = queue.shift(); const rows = await repo.find({ where: { parentId: parent }, take: 100 }); if (!rows.length) break; }
export {};

while (!this.isAborted) { const rows = await prisma.event.findMany({ take: batchSize, where: { done: false } }); if (rows.length === 0) break; await prisma.event.updateMany({ where: { id: { in: rows.map((row) => row.id) } }, data: { done: true } }); }
export {};

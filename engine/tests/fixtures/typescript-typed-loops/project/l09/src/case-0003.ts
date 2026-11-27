while (true) { const rows = await this.repository.find({ take: BATCH, select: ["id"] }); if (!rows.length) break; await this.repository.delete(rows.map((row) => row.id)); }
export {};

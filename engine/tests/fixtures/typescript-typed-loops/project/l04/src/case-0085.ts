for (const part of chunk(rows, 500)) { for (const row of part) { await repository.save(row); } }
export {};

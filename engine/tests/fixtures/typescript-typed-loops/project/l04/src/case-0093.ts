for (const row of rows) { await repository.update(row.id, { done: true }); await producer.send(row); }
export {};

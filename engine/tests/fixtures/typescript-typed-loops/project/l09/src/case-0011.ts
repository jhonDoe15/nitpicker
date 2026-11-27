for (;;) { const page = await repository.find({ limit: 200 }); if (page.length === 0) break; await Promise.all(page.map((row) => queue.push(row))); }
export {};

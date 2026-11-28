for (;;) { const rows = await repo.find({ take: 10 }); use(rows); }
export {};

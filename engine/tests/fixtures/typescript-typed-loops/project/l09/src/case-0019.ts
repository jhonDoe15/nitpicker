for (;;) { const rows = await repo.find({ take: 500 }); use(rows); if (done()) break; }
export {};

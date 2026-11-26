const runner = dataSource.createQueryRunner(); await runner.startTransaction(); try { await runner.manager.save(order); await runner.commitTransaction(); } catch { await runner.rollbackTransaction(); } await fetch(url);
export {};

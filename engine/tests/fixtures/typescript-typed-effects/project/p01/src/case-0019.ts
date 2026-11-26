const runner = dataSource.createQueryRunner(); await runner.startTransaction(); if (!order) { await runner.rollbackTransaction(); return; } await runner.manager.save(order); await fetch(url); await runner.commitTransaction();
export {};

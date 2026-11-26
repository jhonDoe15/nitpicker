const runner = dataSource.createQueryRunner(); await runner.startTransaction(); ok ? await runner.commitTransaction() : await runner.rollbackTransaction(); await fetch(url);
export {};

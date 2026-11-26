const runner = dataSource.createQueryRunner(); await runner.startTransaction(); await runner.manager.save(order); await runner.commitTransaction(); await fetch(url);
export {};

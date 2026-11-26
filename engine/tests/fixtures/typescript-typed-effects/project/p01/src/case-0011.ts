const runner = dataSource.createQueryRunner(); await runner.startTransaction(); if (ok) await runner.commitTransaction(); else await runner.rollbackTransaction(); await fetch(url);
export {};

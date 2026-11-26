const runner = dataSource.createQueryRunner(); await runner.startTransaction(); if (ok) { await runner.commitTransaction(); } await fetch(url);
export {};

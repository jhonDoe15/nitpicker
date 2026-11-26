const runner = dataSource.createQueryRunner(); await runner.startTransaction(); if (ok) await runner.commitTransaction(); else return; await fetch(url);
export {};

const runner = dataSource.createQueryRunner(); await runner.startTransaction(); if (ok) await runner.commitTransaction(); else throw new Error('no'); await fetch(url);
export {};

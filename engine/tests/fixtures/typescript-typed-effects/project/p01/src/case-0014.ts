const runner = dataSource.createQueryRunner(); await runner.startTransaction(); switch (mode) { case 'a': await fetch(url); break; default: await runner.commitTransaction(); }
export {};

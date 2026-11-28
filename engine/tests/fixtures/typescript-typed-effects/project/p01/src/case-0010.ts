const runner = dataSource.createQueryRunner(); await runner.startTransaction(); switch (mode) { case 'a': await runner.commitTransaction(); break; default: await runner.rollbackTransaction(); } await fetch(url);
export {};

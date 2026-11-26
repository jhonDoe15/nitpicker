const semaphore = new Semaphore(5); await semaphore.runExclusive(async () => { await fetch(url); });
export {};

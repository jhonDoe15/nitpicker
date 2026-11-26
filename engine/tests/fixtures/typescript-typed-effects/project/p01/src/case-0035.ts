const semaphore = new Semaphore(1); await semaphore.runExclusive(async () => { await fetch(url); });
export {};

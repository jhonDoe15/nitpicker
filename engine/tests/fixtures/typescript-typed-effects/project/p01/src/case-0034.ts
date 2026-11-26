await mutex.runExclusive(async () => { await fetch(url); });
export {};

await mutex.runExclusive(async () => { if (cache.has(key)) { return; } cache.set(key, await fetch(url)); });
export {};

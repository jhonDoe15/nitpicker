await mutex.runExclusive(async () => { if (closed) { return; } await fetch(url); });
export {};

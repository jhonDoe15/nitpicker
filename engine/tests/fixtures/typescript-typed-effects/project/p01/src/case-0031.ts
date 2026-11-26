await mutex.runExclusive(async () => { token ??= await fetch(url); });
export {};

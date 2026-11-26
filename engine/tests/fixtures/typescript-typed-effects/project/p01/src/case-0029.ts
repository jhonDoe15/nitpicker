await mutex.runExclusive(async () => { if (!token) { token = await fetch(url); } return token; });
export {};

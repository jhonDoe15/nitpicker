await lock.acquire('key', async () => { await httpClient.get(url); });
export {};

const release = await mutex.acquire(); try { await fetch(url); } finally { release(); }
export {};

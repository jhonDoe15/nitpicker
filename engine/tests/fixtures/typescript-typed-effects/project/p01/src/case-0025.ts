const release = await mutex.acquire(); try { count += 1; } finally { release(); } await fetch(url);
export {};

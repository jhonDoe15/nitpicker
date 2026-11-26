const release = await mutex.acquire(); if (busy) { release(); return; } await fetch(url); release();
export {};

const pool = new Semaphore(3); await pool.acquire(); await fetch(url);
export {};

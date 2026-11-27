let item; while ((item = queue.shift())) { await pool.query('s', [item]); await sleep(10); }
export {};

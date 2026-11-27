while (queue.length) { await pool.query('s', [queue.pop()]); await sleep(10); }
export {};

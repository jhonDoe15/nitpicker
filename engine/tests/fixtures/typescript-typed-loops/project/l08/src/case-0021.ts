let item; while (item = queue.pop()) { await pool.query('s', [item.id]); await sleep(10); }
export {};

let item; while (more) { item = it.next(); await pool.query('s', [item]); await sleep(10); }
export {};

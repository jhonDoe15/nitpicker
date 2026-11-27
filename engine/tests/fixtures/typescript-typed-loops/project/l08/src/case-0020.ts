for (const id of ids) { while (!done) { await pool.query('s', [id]); await sleep(10); } }
export {};

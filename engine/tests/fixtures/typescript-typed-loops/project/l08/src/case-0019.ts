let cur = head; while (cur) { await pool.query('d', [cur.id]); cur = cur.next; await sleep(100); }
export {};

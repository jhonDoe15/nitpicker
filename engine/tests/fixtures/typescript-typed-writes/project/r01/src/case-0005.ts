for (const id of ids) { try { await db.query('INSERT INTO orders (id) VALUES ($1)', [id]); } catch { log(); } }
export {};

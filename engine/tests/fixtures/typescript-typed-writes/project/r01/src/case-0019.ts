for (const attempt of attempts) { try { await db.query('INSERT INTO orders (id) VALUES ($1)', [id]); break; } catch { wait(attempt); } }
export {};

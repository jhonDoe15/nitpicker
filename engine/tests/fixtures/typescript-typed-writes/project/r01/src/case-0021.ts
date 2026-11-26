let tries = 0; while (true) { try { await db.query('INSERT INTO orders (id) VALUES ($1)', [id]); break; } catch (error) { tries += 1; if (tries > 3) throw error; } }
export {};

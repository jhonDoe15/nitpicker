for (let attempt = 1; attempt <= 3; attempt++) { try { await db.query('INSERT INTO orders (id) VALUES ($1)', [id]); return; } catch (error) { if (attempt === 3) { throw error; } await wait(attempt); } }
export {};

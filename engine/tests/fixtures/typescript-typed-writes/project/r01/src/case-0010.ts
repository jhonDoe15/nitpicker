import retry from 'async-retry';
await retry(async () => { await db.query('INSERT INTO orders (id) VALUES ($1)', [id]); });
export {};

import pRetry from 'p-retry';
await pRetry(() => db.query('INSERT INTO orders (id) VALUES ($1) ON CONFLICT DO NOTHING', [id]));
export {};

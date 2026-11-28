import pRetry from 'p-retry';
const upsert = 'INSERT INTO orders (id) VALUES ($1) ON CONFLICT DO NOTHING';
await pRetry(() => db.query(upsert, [id]));
export {};

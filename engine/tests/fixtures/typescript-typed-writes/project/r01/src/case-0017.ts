import pRetry from 'p-retry';
const text = 'INSERT INTO orders (id) VALUES ($1)';
await pRetry(() => db.query(text, [id]));
export {};

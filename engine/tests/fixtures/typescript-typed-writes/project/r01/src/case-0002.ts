import pRetry from 'p-retry';
await pRetry(() => db.query('SELECT * FROM orders WHERE id = $1', [id]));
export {};

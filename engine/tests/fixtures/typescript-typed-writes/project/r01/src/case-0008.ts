import pRetry from 'p-retry';
await pRetry(() => db.query({ text: 'SELECT 1 FROM orders', values: [id] }));
export {};

import pRetry from 'p-retry';
await pRetry(() => db.query({ text: 'INSERT INTO orders (id) VALUES ($1)', values: [id] }));
export {};

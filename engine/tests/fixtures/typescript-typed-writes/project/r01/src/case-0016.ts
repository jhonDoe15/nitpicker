import pRetry = require('p-retry');
await pRetry(() => db.query('INSERT INTO orders (id) VALUES ($1)', [id]));
export {};

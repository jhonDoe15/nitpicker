const { backOff } = require('exponential-backoff');
await backOff(() => db.query('INSERT INTO orders (id) VALUES ($1)', [id]));
export {};

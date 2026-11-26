import { retry, handleAll } from 'cockatiel';
await retry(handleAll, { maxAttempts: 3 }).execute(() => db.query('INSERT INTO orders (id) VALUES ($1)', [id]));
export {};

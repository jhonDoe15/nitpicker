import { retry, handleAll } from 'cockatiel';
const policy = retry(handleAll, {});
await policy.execute(() => db.query('INSERT INTO orders (id) VALUES ($1)', [id]));
export {};

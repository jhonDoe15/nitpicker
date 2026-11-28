import { wrap } from 'cockatiel';
import { Pool } from 'pg';
import { policy, breaker } from './policies';
const pool = new Pool();
export async function run(id: string) { await breaker.execute(() => pool.query('INSERT INTO orders (id) VALUES ($1)', [id])); }
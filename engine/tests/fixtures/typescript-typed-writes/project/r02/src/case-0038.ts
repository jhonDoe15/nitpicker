import pRetry from 'p-retry';
import { Pool } from 'pg';
const pool = new Pool();
const text = 'INSERT INTO orders (id) VALUES ($1)';
export async function run(id: string) { await pRetry(() => pool.query(text, [id])); }
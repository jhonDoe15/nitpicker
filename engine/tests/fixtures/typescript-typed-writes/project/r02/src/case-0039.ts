import pRetry from 'p-retry';
import { Pool } from 'pg';
const pool = new Pool();
export async function run(id: string) { await pRetry(() => pool.query({ text: 'INSERT INTO orders (id) VALUES ($1)', values: [id] })); }
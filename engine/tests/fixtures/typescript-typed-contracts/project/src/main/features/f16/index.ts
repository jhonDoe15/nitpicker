import type { Knex } from 'knex';
type Tx = Knex.Transaction;
export const orders = { inTransaction(run: (tx: Tx) => Promise<void>): Promise<void> { return Promise.resolve(String(run)).then(() => undefined); } };
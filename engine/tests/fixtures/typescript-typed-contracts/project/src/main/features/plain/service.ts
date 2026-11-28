import type { Knex } from 'knex';
export function rows(tx: Knex.Transaction): Promise<void> { return tx.commit(); }
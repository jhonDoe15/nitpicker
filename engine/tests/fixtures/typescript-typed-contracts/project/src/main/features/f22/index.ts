import type { Knex } from 'knex';
export interface OrderStore { session(): Knex.Transaction; count(): number }
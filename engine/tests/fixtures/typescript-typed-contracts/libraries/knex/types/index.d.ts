export declare namespace Knex {
  interface Transaction { commit(): Promise<void> }
  interface QueryBuilder<T = unknown> { first(): Promise<T> }
}
export interface Knex { transaction(): Promise<Knex.Transaction> }
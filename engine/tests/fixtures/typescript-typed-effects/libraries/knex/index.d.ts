export interface QueryBuilder {
  where(condition: object): QueryBuilder;
  insert(row: object): QueryBuilder;
  then<R>(done: (rows: unknown[]) => R): Promise<R>;
}
export interface Knex {
  (table: string): QueryBuilder;
  transaction<T>(work: (trx: Knex) => Promise<T>): Promise<T>;
}
declare function knex(config: object): Knex;
export default knex;

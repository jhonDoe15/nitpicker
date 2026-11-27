import { Kysely } from 'kysely';
declare const db: Kysely<any>;
export async function f(rows: (Foo[]), more: ((readonly Foo[])), other: (Array<Foo>)) {
  await db.insertInto('t').values(rows).execute();
  await db.insertInto('t').values(more).execute();
  return db.insertInto('t').values(other).execute();
}
